import hashlib
import json
from datetime import timedelta

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.db import models, transaction
from django.http import Http404, HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.html import escape
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from jsonschema import ValidationError, validate
from modern_csrf.decorators import csrf_protect
from opentelemetry import trace

from .models import Link, Share, ShareStatus
from .share_schema import share_schema
from .tasks import check_link_safety, fetch_link_preview

tracer = trace.get_tracer(__name__)


def shares(request):
    shares = Share.objects.filter(parent_share__isnull=True)
    template = ""
    for share in shares:
        url = request.build_absolute_uri(f"/{share.shortcode}")
        template += (
            f'<div><a href="{url}">{escape(share.title)} {share.created_at}</a></div>'
        )

    return HttpResponse(
        f'<div style="background-color:white;"><h1>Shares</h1>{template}</div>'
    )


def view_share(request, shortcode):
    share = get_object_or_404(Share, shortcode=shortcode)

    if share.is_expired or share.status == ShareStatus.BLOCKED:
        return render(request, "shares/view_expired.html", status=410)

    share_data = share.to_dict()
    link_count = 0
    shares = [share_data]
    while len(shares):
        s = shares.pop(0)
        for link in s.get("links"):
            if link.get("links"):
                shares.append(link)
            else:
                link_count += 1

    with tracer.start_as_current_span("share.view") as span:
        span.set_attribute("share.shortcode", shortcode)
        span.set_attribute("share.status", share.status)
        span.set_attribute("share.link_count", link_count)
        span.set_attribute("share.is_nested", share.parent_share_id is not None)

    return render(
        request,
        "shares/view_share.html",
        {
            "share_data": share_data,
            "share_title": share.title,
            "link_count": link_count,
            "expiry_text": share.expiry_text,
        },
    )


SHARE_EXPIRY_DAYS = 7


@transaction.atomic
def create_share_from_data(data, user, parent_share=None, idempotency_key=None):
    share = Share.objects.create(
        user=user,
        title=data["title"],
        parent_share=parent_share,
        expires_at=(
            timezone.now() + timedelta(days=SHARE_EXPIRY_DAYS)
            if parent_share is None
            else None
        ),
        idempotency_key=idempotency_key,
    )

    links = []
    for obj in data["links"]:
        if obj.get("url"):
            links.append(Link(share=share, title=obj.get("title", ""), url=obj["url"]))
        elif obj.get("links"):
            create_share_from_data(obj, user=user, parent_share=share)

    created_links = Link.objects.bulk_create(links)
    for link in created_links:
        fetch_link_preview.delay_on_commit(str(link.id))
        check_link_safety.delay_on_commit(str(link.id))

    return share


@require_POST
@csrf_protect
def create_share(request):
    if not request.user.is_authenticated:
        try:
            data = json.loads(request.body)
            link_count = len(data.get("links", []))
            if link_count:
                request.session["pending_link_count"] = link_count
        except (json.JSONDecodeError, TypeError):
            pass
        return HttpResponse(status=401)

    try:
        data = json.loads(request.body)
        validate(instance=data, schema=share_schema)

    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON in request body")

    except ValidationError as e:
        return HttpResponseBadRequest(f"JSON validation error: {e.message}")

    # Server-calculated idempotency key from request body hash.
    # Phase 4: include user ID in hash once FxA auth is wired up.
    idempotency_key = hashlib.sha256(request.body).hexdigest()

    existing = Share.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        with tracer.start_as_current_span("share.create") as span:
            span.set_attribute("share.outcome", "idempotent_duplicate")
            span.set_attribute("share.shortcode", existing.shortcode)
            url = request.build_absolute_uri(f"/{existing.shortcode}")
            return JsonResponse({"url": url})

    with tracer.start_as_current_span("share.create") as span:
        span.set_attribute("share.outcome", "created")
        span.set_attribute("share.link_count", len(data.get("links", [])))
        share = create_share_from_data(
            data=data, user=request.user, idempotency_key=idempotency_key
        )
        span.set_attribute("share.shortcode", share.shortcode)
        url = request.build_absolute_uri(f"/{share.shortcode}")
        return JsonResponse({"url": url}, status=201)


VALID_REPORT_REASONS = {"copyright", "harmful", "spam", "other"}


@require_POST
@csrf_protect
def report_share(request, shortcode):
    reason = request.POST.get("reason")

    if not reason:
        return HttpResponseBadRequest("Missing required field: reason")

    if reason not in VALID_REPORT_REASONS:
        return HttpResponseBadRequest(f"Invalid reason: {reason}")

    share = get_object_or_404(Share, shortcode=shortcode)
    with tracer.start_as_current_span("share.report") as span:
        span.set_attribute("share.shortcode", shortcode)
        span.set_attribute("report.reason", reason)
        # Only transition ACTIVE shares
        updated = Share.objects.filter(pk=share.pk, status=ShareStatus.ACTIVE).update(
            status=ShareStatus.UNDER_REVIEW
        )
        span.set_attribute("share.transitioned", updated > 0)

    messages.success(request, "Your report has been submitted.")
    return redirect(reverse("view_share", args=[shortcode]))


VALID_CLIENT_EVENTS = {"copy_link", "link_click", "report_dialog_open", "cta_click"}


@require_POST
@csrf_exempt  # Telemetry only — no state mutation, so CSRF is unnecessary.
def record_client_event(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, TypeError):
        return HttpResponseBadRequest("Invalid JSON")

    event_type = data.get("event_type", "")
    if event_type not in VALID_CLIENT_EVENTS:
        return HttpResponseBadRequest(f"Unknown event type: {event_type}")

    properties = data.get("properties", {})
    with tracer.start_as_current_span(f"client.{event_type}") as span:
        for key, value in properties.items():
            if isinstance(value, (str, int, float, bool)):
                span.set_attribute(key, value)

    return HttpResponse(status=204)


def auth_complete(request):
    link_count = request.session.pop("pending_link_count", 8)
    return render(request, "shares/view_auth_complete.html", {"link_count": link_count})


def landing(request):
    return render(request, "shares/landing.html")


def dev_login(request):
    """DEBUG-only flow to log in as any (seed) user without real FxA OAuth.

    Reachable only when ``DEBUG=True`` (the URL is registered conditionally and
    this view also guards directly). Pairs with the ``seed`` management command:
    seed the DB, then pick a user here to log in as for manual QA.
    """
    if not settings.DEBUG:
        raise Http404

    user_model = get_user_model()

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "logout":
            logout(request)
            request._fxsharing_logged_out = True
            messages.success(request, "Logged out.")
            return redirect(reverse("dev_login"))

        user = get_object_or_404(user_model.all_objects, pk=request.POST.get("user_id"))
        login(
            request,
            user,
            backend="django.contrib.auth.backends.ModelBackend",
        )
        request._fxsharing_logged_in = True
        messages.success(request, f"Logged in as {user.fxa_id}.")
        return redirect(reverse("dev_login"))

    users = user_model.all_objects.annotate(
        share_count=models.Count("shares")
    ).order_by("fxa_id")
    return render(request, "shares/dev_login.html", {"dev_users": users})


def page_not_found(request, exception):
    return render(request, "shares/404.html", status=404)


def server_error(request):
    return render(request, "shares/500.html", status=500)

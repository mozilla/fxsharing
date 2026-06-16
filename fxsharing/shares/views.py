import hashlib
import hmac
import json
import logging
from datetime import timedelta

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.db import models, transaction
from django.http import Http404, HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.html import escape
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

import requests
from jsonschema import ValidationError, validate
from modern_csrf.decorators import csrf_protect

from .models import Link, Share, ShareStatus
from .share_schema import share_schema
from .tasks import check_link_safety, fetch_link_preview

log = logging.getLogger(__name__)


class CinderWebhookError(ValidationError):
    """Validation error from Cinder webhook payload. Returned to Cinder as 400 error."""

    reportable = True


class CinderWebhookIgnoredError(CinderWebhookError):
    """Not an error, a decision we ignore because we already took action, or it's for an entity we don't need to track."""

    reportable = False


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

    return render(
        request,
        "shares/view_share.html",
        {
            "share": share_data,
            "link_count": link_count,
            "expiry_text": share.expiry_text,
        },
    )


SHARE_EXPIRY_DAYS = 7


def active_share_count(user):
    """Count a user's active top-level shares for the share-creation limit.

    Only ``ACTIVE`` shares count: pending, under-review, flagged, blocked, and
    expired shares do not count against the user's limit. We pair the status
    check with ``expires_at__gt`` because expiry is lazy — a share past its
    ``expires_at`` keeps ``status == ACTIVE`` until something transitions it, so
    the timestamp is what actually decides whether it is still live (mirroring
    ``Share.is_expired``).

    The default manager already excludes soft-deleted shares. ``expires_at`` and
    ``timezone.now()`` are both timezone-aware UTC instants, so the comparison
    is correct regardless of the server's or the user's local timezone.
    """
    return Share.objects.filter(
        user=user,
        parent_share__isnull=True,
        status=ShareStatus.ACTIVE,
        expires_at__gt=timezone.now(),
    ).count()


@transaction.atomic
def create_share_from_data(data, user, parent_share=None):
    share = Share.objects.create(
        user=user,
        title=data["title"],
        type=data["type"],
        parent_share=parent_share,
        expires_at=(
            timezone.now() + timedelta(days=SHARE_EXPIRY_DAYS)
            if parent_share is None
            else None
        ),
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


def report_link_sharing_quality(share):
    token = settings.CINDER_API_TOKEN
    endpoint = settings.CINDER_API_ENDPOINT
    reason = "link_sharing"  # TODO figure out what reason is for

    payload = {
        "event_name": "link_sharing_quality",
        "entity": {
            "entity_schema": "fxsharing",
            "attributes": {
                "id": str(share.id),
                "shortcode": share.shortcode,
                "title": share.title,
                "reason": reason,
            },
        },
        "subgraph": {
            "entities": [
                {
                    "entity_schema": "fxsharing_url",
                    "attributes": {
                        "id": str(link.id),
                        "url": link.url,
                        "title": link.title,
                    },
                }
                for link in share.links.all()[:30]
            ],
            "relationships": [],
        },
    }

    response = requests.post(
        endpoint,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response


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

    # Cap how many active (non-deleted, non-expired) shares a user may hold.
    if active_share_count(request.user) >= settings.MAX_ACTIVE_SHARES:
        return JsonResponse(
            {"error": "You have reached the maximum number of active shares."},
            status=429,
        )

    # Always create a fresh share page so a user can generate a new link
    # from the same tab group each time they share.
    share = create_share_from_data(data=data, user=request.user)
    # TODO - enqueue a job instead, so we don't block the response on Cinder responding
    try:
        report_link_sharing_quality(share)
    except requests.RequestException:
        log.exception("Cinder quality report failed for share %s", share.id)

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
    # Only transition ACTIVE shares
    Share.objects.filter(pk=share.pk, status=ShareStatus.ACTIVE).update(
        status=ShareStatus.UNDER_REVIEW
    )

    messages.success(request, "Your report has been submitted")
    return redirect(reverse("view_share", args=[shortcode]))


VALID_CLIENT_EVENTS = {
    "copy_link",
    "link_click",
    "report_dialog_open",
    "cta_click",
    "tou_click",
    "aup_click",
}


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


# First-iteration pass at webhook listener.
@require_POST
@csrf_exempt
def ts_webhook(request):
    # Loosely based on the AMO webhook handler at:
    # https://github.com/mozilla/addons-server/blob/165b73f1/src/olympia/abuse/views.py#L355

    # Verify the webhook signature matches the token.
    header = request.headers.get("X-Cinder-Signature", "")
    key = force_bytes(settings.CINDER_WEBHOOK_TOKEN)
    digest = hmac.new(key, msg=request.body, digestmod=hashlib.sha256).hexdigest()
    if not hmac.compare_digest(header, digest):
        log.error("Invalid webhook signature")
        return HttpResponseBadRequest("Invalid webhook token")

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON in request body")

    event = data.get("event")
    payload = data.get("payload") or {}

    try:
        match event:
            case "decision.created":
                log.info("Valid payload from fxsharing queue: %s", payload)

                share_id = payload.get("entity", {}).get("attributes", {}).get("id")
                try:
                    share = Share.objects.get(id=share_id)
                except Share.DoesNotExist:
                    log.warning("Webhook for unknown share id %s; ignoring", share_id)
                    return JsonResponse(
                        {
                            "fxsharing": {
                                "received": True,
                                "handled": False,
                                "not_handled_reason": "unknown share id",
                            }
                        },
                        status=200,
                    )

                for action in payload.get("enforcement_actions") or []:
                    log.info("Received enforcement action: %s", action)
                    if action == "link-collections-ban-user":
                        # TODO actually implement user banning.
                        Share.objects.filter(user=share.user).update(
                            status=ShareStatus.BLOCKED
                        )
                        break
                    elif action == "link-collections-dont-publish-collection":
                        Share.objects.filter(pk=share.pk).update(
                            status=ShareStatus.BLOCKED
                        )
                    elif action == "link-collections-publish-collection":
                        # TODO add a "passed review" ShareStatus so we can
                        # audit published shares for any that never got
                        # approved.
                        pass

            case "job.actioned":
                # For now, we just ignore these. Even in cases where a share
                # was enqueued for processing, we should also get a decision
                # created event.
                pass
            case _:
                log.info("Unsupported payload received: %s", str(data)[:255])
                raise CinderWebhookError(f"{event} is not supported")
    except CinderWebhookError as exc:
        return JsonResponse(
            data={
                "fxsharing": {
                    "received": True,
                    "handled": False,
                    "not_handled_reason": exc.message,
                }
            },
            # Differentiate errors we want exposed in Cinder's logs, and
            # known cases where we can safely ignore the error.
            status=(400 if exc.reportable else 200),
        )
    return JsonResponse(
        data={"fxsharing": {"received": True, "handled": True}},
        status=201,
    )

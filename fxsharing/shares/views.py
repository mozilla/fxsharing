import hashlib
import json
import time
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.utils.html import escape
from django.views.decorators.http import require_POST

from jsonschema import ValidationError, validate
from modern_csrf.decorators import csrf_protect

from .models import Link, Share, ShareStatus
from .share_schema import share_schema
from .tasks import check_link_safety, fetch_link_preview, process_report


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


def api_share(request, shortcode):
    share = get_object_or_404(Share, shortcode=shortcode)
    return JsonResponse(share.to_dict())


def view_share(request, shortcode):
    # 404 if shortcode unknown; share data is fetched client-side by moz-share.mjs
    get_object_or_404(Share, shortcode=shortcode)
    return render(request, "shares/view_share.html", {"shortcode": shortcode})


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
        url = request.build_absolute_uri(f"/{existing.shortcode}")
        return JsonResponse({"url": url})

    share = create_share_from_data(
        data=data, user=request.user, idempotency_key=idempotency_key
    )

    url = request.build_absolute_uri(f"/{share.shortcode}")
    return JsonResponse({"url": url}, status=201)


VALID_REPORT_REASONS = {"copyright", "harmful", "spam", "other"}
REPORT_THROTTLE_WINDOW_SECONDS = 3600


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _report_rate_limited(ip):
    # Approximated sliding window across two adjacent fixed buckets.
    # Weight the previous bucket by how much of it still falls inside the
    # trailing window; add the current bucket's count in full.
    limit = settings.REPORT_RATE_LIMIT_PER_HOUR
    window = REPORT_THROTTLE_WINDOW_SECONDS
    now = time.time()
    current_bucket = int(now // window)
    elapsed = now - current_bucket * window
    prev_weight = (window - elapsed) / window

    key_current = f"report_throttle:{ip}:{current_bucket}"
    key_previous = f"report_throttle:{ip}:{current_bucket - 1}"

    prev_count = cache.get(key_previous, 0)
    curr_count = cache.get(key_current, 0)
    estimated = prev_count * prev_weight + curr_count
    if estimated >= limit:
        return True

    if not cache.add(key_current, 1, timeout=2 * window):
        cache.incr(key_current)
    return False


def _collect_urls(share):
    urls = list(share.links.values_list("url", flat=True))
    for nested in share.nested_shares.all():
        urls.extend(_collect_urls(nested))
    return urls


@require_POST
@csrf_protect
def report_share(request, shortcode):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON in request body")

    reason = data.get("reason")

    if not reason:
        return HttpResponseBadRequest("Missing required field: reason")

    if reason not in VALID_REPORT_REASONS:
        return HttpResponseBadRequest(f"Invalid reason: {reason}")

    ip = _client_ip(request)
    if _report_rate_limited(ip):
        return JsonResponse({"error": "rate_limited"}, status=429)

    share = get_object_or_404(Share, shortcode=shortcode)
    # Only transition ACTIVE shares
    Share.objects.filter(pk=share.pk, status=ShareStatus.ACTIVE).update(
        status=ShareStatus.UNDER_REVIEW
    )

    process_report.delay(
        {
            "shortcode": shortcode,
            "share_id": str(share.id),
            "share_title": share.title,
            "urls": _collect_urls(share),
            "reason": reason,
            "reporter_ip": ip,
            "reported_at": timezone.now().isoformat(),
        }
    )

    return JsonResponse({"status": "reported"})


def auth_complete(request):
    return render(request, "shares/view_auth_complete.html")

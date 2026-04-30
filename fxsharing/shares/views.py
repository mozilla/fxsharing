import hashlib
import json
from datetime import timedelta

from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.utils.html import escape
from django.views.decorators.http import require_POST

from jsonschema import ValidationError, validate
from modern_csrf.decorators import csrf_protect

from .models import Link, Share
from .share_schema import share_schema


def shares(request):
    shares = Share.objects.filter(parent_share__isnull=True)
    template = ""
    for share in shares:
        url = request.build_absolute_uri(f"/{share.id}")
        template += (
            f'<div><a href="{url}">{escape(share.title)} {share.created_at}</a></div>'
        )

    return HttpResponse(
        f'<div style="background-color:white;"><h1>Shares</h1>{template}</div>'
    )


def api_share(request, share_id):
    share = get_object_or_404(Share, id=share_id)

    links = list(share.links.all())
    shares_to_query = list(share.nested_shares.all())
    links += shares_to_query
    while len(shares_to_query):
        nested_share = shares_to_query.pop(0)
        nested_links = list(nested_share.links.all())
        nested_shares = list(nested_share.nested_shares.all())

        nested_links += nested_shares
        shares_to_query += nested_shares

    return JsonResponse(share.to_dict())


def view_share(request, share_id):
    return render(request, "shares/view_share.html")


SHARE_EXPIRY_DAYS = 7


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

    Link.objects.bulk_create(links)

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
        url = request.build_absolute_uri(f"/{existing.id}")
        return JsonResponse({"url": url})

    share = create_share_from_data(data=data, user=request.user, idempotency_key=idempotency_key)


    url = request.build_absolute_uri(f"/{share.id}")
    return JsonResponse({"url": url}, status=201)


def auth_complete(request):
    return render(request, "shares/view_auth_complete.html")

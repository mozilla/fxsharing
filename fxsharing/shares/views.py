import json

from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from jsonschema import ValidationError, validate

from .models import Link, Share
from .share_schema import share_schema


def shares(request):
    shares = Share.objects.filter(parent_share__isnull=True)
    template = ""
    for share in shares:
        url = request.build_absolute_uri(f"/{share.id}")
        template += f'<div><a href="{url}">{share.title} {share.created_at}</a></div>'

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


def create_share_from_data(data, parent_share=None):
    share = Share.objects.create(
        # user_id="abc123",
        title=data["title"],
        parent_share=parent_share,
    )

    links = []
    for obj in data["links"]:
        if obj.get("url"):
            links.append(Link(share=share, title=obj.get("title", ""), url=obj["url"]))
        elif obj.get("links"):
            create_share_from_data(obj, parent_share=share)

    Link.objects.bulk_create(links)

    return share


@csrf_exempt
@require_POST
def create_share(request):
    try:
        data = json.loads(request.body)

        validate(instance=data, schema=share_schema)

    except json.JSONDecodeError:
        return HttpResponseBadRequest("Invalid JSON in request body")

    except ValidationError as e:
        return HttpResponseBadRequest(f"JSON validation error: {e.message}")

    share = create_share_from_data(data=data)

    url = request.build_absolute_uri(f"/{share.id}")

    return JsonResponse({"url": url})

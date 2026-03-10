import json
from os import link

from django import forms
from django.core.validators import URLValidator
from django.forms.models import model_to_dict
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


def view_share(request, share_id):
    share = get_object_or_404(Share, id=share_id)
    # nested_share = None
    # while nested_share is not None:

    links = list(share.links.all())
    shares_to_query = list(share.nested_shares.all())
    links += shares_to_query
    while len(shares_to_query):
        nested_share = shares_to_query.pop(0)
        nested_links = list(nested_share.links.all())
        nested_shares = list(nested_share.nested_shares.all())

        nested_links += nested_shares
        shares_to_query += nested_shares

    return render(
        request,
        "shares/view_share.html",
        {
            "share_dict": share.to_dict(),
        },
    )


def create_share_from_data(data, parent_share=None):
    fxa_id = data["fxa_id"]

    share = Share.objects.create(
        fxa_id=fxa_id, title=data["title"], parent_share=parent_share
    )

    links = []
    for obj in data["links"]:
        if obj.get("url"):
            links.append(Link(share=share, title=obj.get("title", ""), url=obj["url"]))
        elif obj.get("links"):
            obj["fxa_id"] = fxa_id
            create_share_from_data(obj, parent_share=share)

    Link.objects.bulk_create(links)

    return share


@csrf_exempt
@require_POST
def create_share(request):
    print("here")
    try:
        data = json.loads(request.body)

        validate(instance=data, schema=share_schema)

    except json.JSONDecodeError as e1:
        print(e1)
        return HttpResponseBadRequest("Invalid JSON in request body")

    except ValidationError as e:
        print(e)
        # Return meaningful error messages to the client
        return HttpResponseBadRequest(f"JSON validation error: {e.message}")

    print(data)

    share = create_share_from_data(data=data)

    url = request.build_absolute_uri(f"/{share.id}")

    return JsonResponse({"url": url})

    # return JsonResponse(data)

    # links = Link.objects.bulk_create(
    #     [
    #         Link(share=share, title=link.get("title", ""), url=link["url"])
    #         for link in form.cleaned_data["links"]
    #     ]
    # )

    # share = Share.objects.create(
    #     fxa_id=form.cleaned_data["fxa_id"],
    #     title=form.cleaned_data["title"],
    # )
    # links = Link.objects.bulk_create(
    #     [
    #         Link(share=share, title=link.get("title", ""), url=link["url"])
    #         for link in form.cleaned_data["links"]
    #     ]
    # )
    # url = request.build_absolute_uri(f"/{share.id}")
    # return JsonResponse(
    #     {
    #         "url": url,
    #         "share": {
    #             "id": share.id,
    #             "title": share.title,
    #             "links": [
    #                 {"id": str(link.id), "title": link.title, "url": link.url}
    #                 for link in links
    #             ],
    #         },
    #     },
    #     status=201,
    # )

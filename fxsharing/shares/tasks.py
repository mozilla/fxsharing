import requests
from bs4 import BeautifulSoup
from celery import shared_task


@shared_task(
    autoretry_for=(requests.exceptions.RequestException,),
    max_retries=3,
    default_retry_delay=30,
)
def fetch_link_preview(link_id):
    from .models import Link

    try:
        link = Link.objects.get(id=link_id)
    except Link.DoesNotExist:
        return

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (platform; rv:gecko-version)"
            " Gecko/gecko-trail Firefox/firefox-version"
        )
    }

    r = requests.get(link.url, headers=headers, timeout=10)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    og_tags = {}
    for meta_tag in soup.find_all("meta", property=lambda p: p and p.startswith("og:")):
        prop = meta_tag.get("property")
        content = meta_tag.get("content")
        if prop and content:
            og_tags[prop.replace("og:", "")] = content

    Link.objects.filter(id=link_id).update(
        preview_title=og_tags.get("title", "")[:255],
        preview_description=og_tags.get("description", ""),
        preview_image_url=og_tags.get("image", "")[:2048],
    )


@shared_task
def check_link_safety(link_id):
    # Stub: Web Risk API integration would go here
    pass

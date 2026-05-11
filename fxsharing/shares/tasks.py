import requests
from bs4 import BeautifulSoup
from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


@shared_task(
    autoretry_for=(requests.exceptions.RequestException,),
    max_retries=3,
    default_retry_delay=30,
    retry_backoff=True,
)
def fetch_link_preview(link_id):
    from .models import Link

    try:
        link = Link.objects.get(id=link_id)
    except Link.DoesNotExist:
        return

    logger.info("fetching preview for %s (link_id=%s)", link.url, link_id)

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:151.0)"
            " Gecko/20100101 Firefox/151.0"
        )
    }

    r = requests.get(link.url, headers=headers, timeout=10)
    try:
        r.raise_for_status()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            logger.warning("404 for %s (link_id=%s), skipping", link.url, link_id)
            return  # dead link; don't retry
        raise

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

    logger.info("stored preview for %s: title=%r", link.url, og_tags.get("title", ""))


@shared_task
def check_link_safety(link_id):
    # Stub: Web Risk API integration would go here
    pass

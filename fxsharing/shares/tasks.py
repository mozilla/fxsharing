import mimetypes
from urllib.parse import urljoin

from django.conf import settings

import requests
from bs4 import BeautifulSoup
from celery import shared_task
from celery.utils.log import get_task_logger
from google.cloud import storage

logger = get_task_logger(__name__)

FAVICON_MAX_BYTES = 1 * 1024 * 1024  # 1 MB cap
CONTENT_TYPE_TO_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
}


def download_and_store_favicon(favicon_url, link_id, headers):
    """Download favicon and upload to GCS. Returns public URL or None on failure."""
    bucket_name = settings.GCS_FAVICON_BUCKET
    if not bucket_name:
        logger.info("GCS_FAVICON_BUCKET not configured; skipping favicon upload")
        return None

    try:
        resp = requests.get(favicon_url, headers=headers, timeout=10)
        resp.raise_for_status()

        content_type = (
            resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
        )
        if not content_type.startswith("image/"):
            logger.info(
                "favicon at %s has non-image Content-Type %r; skipping",
                favicon_url,
                content_type,
            )
            return None

        if len(resp.content) > FAVICON_MAX_BYTES:
            logger.info(
                "favicon at %s exceeds %d bytes; skipping",
                favicon_url,
                FAVICON_MAX_BYTES,
            )
            return None

        ext = (
            CONTENT_TYPE_TO_EXT.get(content_type)
            or mimetypes.guess_extension(content_type)
            or ".ico"
        )
        object_name = f"favicons/{link_id}{ext}"

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        blob.upload_from_string(resp.content, content_type=content_type)

        return f"https://storage.googleapis.com/{bucket_name}/{object_name}"
    except Exception:
        logger.warning(
            "failed to download/upload favicon for link_id=%s from %s",
            link_id,
            favicon_url,
            exc_info=True,
        )
        return None


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

    title = None
    if soup.title:
        title = soup.title.get_text(strip=True)
    if not title:
        og_title = soup.find("meta", attrs={"property": "og:title"})
        if og_title and og_title.get("content"):
            title = og_title["content"].strip()
    if title:
        title = title[:255]
    else:
        logger.info("No title found for %s", link.url)

    description = None
    desc_tag = soup.find("meta", attrs={"name": "description"})
    if desc_tag and desc_tag.get("content"):
        description = desc_tag["content"].strip()
    if not description:
        og_desc = soup.find("meta", attrs={"property": "og:description"})
        if og_desc and og_desc.get("content"):
            description = og_desc["content"].strip()

    if not description:
        logger.info("No description found for %s", link.url)

    icon_link = (
        soup.find("link", rel="icon")
        or soup.find("link", rel="shortcut icon")
        or soup.find("link", rel="apple-touch-icon")
    )
    if icon_link and icon_link.get("href"):
        favicon = urljoin(link.url, icon_link["href"])
    else:
        logger.info("No favicon found for %s. Using default /favicon.ico", link.url)
        favicon = urljoin(link.url, "/favicon.ico")

    stored_favicon = download_and_store_favicon(favicon, link_id, headers)

    # Only storing favicons for now, preview images will come later.
    Link.objects.filter(id=link_id).update(
        preview_title=title or link.title,
        preview_description=description or "No description found",
        favicon_image_url=stored_favicon,
    )

    logger.info("stored preview for %s: title=%r", link.url, title)


@shared_task
def check_link_safety(link_id):
    # Stub: Web Risk API integration would go here
    pass

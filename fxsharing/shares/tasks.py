import mimetypes
from urllib.parse import urljoin

from django.conf import settings

import requests
from bs4 import BeautifulSoup
from celery import shared_task
from celery.contrib.django.task import DjangoTask
from celery.utils.log import get_task_logger
from google.cloud import storage

from fxsharing.shares.models import SafetyStatus

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
    bucket_name = settings.GCS_IMAGE_BUCKET
    if not bucket_name:
        logger.info("GCS_IMAGE_BUCKET not configured; skipping favicon upload")
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


class BaseTaskWithRetry(DjangoTask):
    """Celery base task with retry-with-backoff defaults and DLQ on exhaustion.

    Subclasses (or `@shared_task(base=BaseTaskWithRetry)` callers) inherit:
      - automatic retry on any unhandled `Exception` (override `autoretry_for`
        on a task to narrow the set)
      - exponential backoff capped at `retry_backoff_max` seconds, with jitter
      - a structured log line on every retry
      - a `DeadLetterTask` row + structured log line when retries are exhausted
    """

    autoretry_for = (Exception,)
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    max_retries = 3

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        attempt = (self.request.retries or 0) + 1
        logger.warning(
            "celery task retry: %s (attempt %d/%d) exc=%s",
            self.name,
            attempt,
            self.max_retries,
            exc,
            extra={
                "task_name": self.name,
                "task_id": task_id,
                "attempt": attempt,
                "max_retries": self.max_retries,
                "exception_class": type(exc).__name__,
            },
        )
        super().on_retry(exc, task_id, args, kwargs, einfo)

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        from .models import DeadLetterTask

        traceback = einfo.traceback if einfo else ""
        queue = (self.request.delivery_info or {}).get("routing_key", "") or ""
        logger.error(
            "celery task moved to DLQ: %s exc=%s",
            self.name,
            exc,
            extra={
                "task_name": self.name,
                "task_id": task_id,
                "exception_class": type(exc).__name__,
                "queue": queue,
            },
        )
        DeadLetterTask.objects.create(
            task_name=self.name,
            task_id=task_id or "",
            args=list(args or []),
            kwargs=dict(kwargs or {}),
            exception_class=type(exc).__name__,
            exception_message=str(exc),
            traceback=traceback,
            queue=queue,
        )
        super().on_failure(exc, task_id, args, kwargs, einfo)


@shared_task(
    base=BaseTaskWithRetry,
    autoretry_for=(requests.exceptions.RequestException,),
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

    # Only follow 5 redirects
    session = requests.Session()
    session.max_redirects = 5

    try:
        response = session.get(link.url, headers=headers, timeout=10)
        response.raise_for_status()

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            logger.warning("404 for %s (link_id=%s), skipping", link.url, link_id)
            return  # dead link; don't retry
        raise
    except requests.exceptions.TooManyRedirects:
        logger.warning(
            "Too many redirects: %s redirects more than 5 times",
            link.url,
        )
        # Link is bad
        Link.objects.filter(id=link_id).update(safety_status=SafetyStatus.UNSAFE)
        return

    soup = BeautifulSoup(response.text, "html.parser")

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
        preview_description=description or None,
        favicon_url=stored_favicon or "",
    )

    logger.info("stored preview for %s: title=%r", link.url, title)


@shared_task(base=BaseTaskWithRetry)
def check_link_safety(link_id):
    # Stub: Web Risk API integration would go here
    pass

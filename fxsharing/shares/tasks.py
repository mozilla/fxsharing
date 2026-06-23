import functools
from urllib.parse import urljoin, urlparse

from django.conf import settings

import requests
from bs4 import BeautifulSoup
from celery import group, shared_task
from celery.contrib.django.task import DjangoTask
from celery.utils.log import get_task_logger
from google.cloud import storage

from fxsharing.shares import metrics
from fxsharing.shares.models import SafetyStatus
from fxsharing.shares.url_safety import UnsafeURLError, safe_get

logger = get_task_logger(__name__)

FAVICON_MAX_BYTES = 1 * 1024 * 1024  # 1 MB cap


@functools.cache
def _get_gcs_client():
    """Return a process-wide GCS client, created lazily on first use.

    ``storage.Client()`` performs credential discovery and a metadata-server
    round trip, so we reuse one client per worker process rather than build a
    new one for every favicon.
    """
    return storage.Client()


def download_and_store_favicon(favicon_url, link_url, headers):
    """Download favicon and upload to GCS. Returns public URL or None on failure."""
    bucket_name = settings.GCS_IMAGE_BUCKET
    if not bucket_name:
        logger.info("GCS_IMAGE_BUCKET not configured; skipping favicon upload")
        return None

    try:
        resp = safe_get(
            favicon_url,
            headers=headers,
            timeout=10,
            max_redirects=settings.MAX_REDIRECTS,
        )
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

        hostname = urlparse(link_url).hostname
        object_name = f"favicons/{hostname}"

        client = _get_gcs_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)

        # Overwrite the favicon in case the existing one is stale
        blob.upload_from_string(resp.content, content_type=content_type)

        return f"https://storage.googleapis.com/{bucket_name}/{object_name}"

    except Exception:
        logger.warning(
            "failed to download/upload favicon for link_url=%s from %s",
            link_url,
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
        metrics.task_retried.add(
            1, {"task": self.name, "exception_class": type(exc).__name__}
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
        metrics.task_deadlettered.add(
            1, {"task": self.name, "exception_class": type(exc).__name__}
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

    try:
        response = safe_get(
            link.url,
            headers=headers,
            timeout=10,
            max_redirects=settings.MAX_REDIRECTS,
        )
        response.raise_for_status()

    except UnsafeURLError as e:
        logger.warning(
            "refusing to fetch unsafe URL %s (link_id=%s): %s",
            link.url,
            link_id,
            e,
        )
        Link.objects.filter(id=link_id).update(safety_status=SafetyStatus.UNSAFE)
        return  # don't retry; the target is not publicly fetchable
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            logger.warning("404 for %s (link_id=%s), skipping", link.url, link_id)
            return  # dead link; don't retry
        raise
    except requests.exceptions.TooManyRedirects:
        logger.warning(
            "Too many redirects: %s redirects more than %d times",
            link.url,
            settings.MAX_REDIRECTS,
        )
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

    stored_favicon = download_and_store_favicon(favicon, link.url, headers)

    # Only storing favicons for now, preview images will come later.
    Link.objects.filter(id=link_id).update(
        preview_title=title or link.title,
        preview_description=description or None,
        favicon_url=stored_favicon or "",
    )

    logger.info("stored preview for %s: title=%r", link.url, title)


def build_cinder_workflow_event(link, share):
    return {
        "event_name": "link_sharing_quality",
        "entity": {
            "entity_schema": "fxsharing_url",
            "attributes": {
                "id": str(link.id),
                "url": link.url,
                "title": link.title,
                "metadata": {
                    "shared_page_id": str(share.id),
                    "submitted_at": share.created_at.isoformat(),
                    "context": "URL submitted as part of a link collection.",
                },
            },
        },
        "subgraph": {
            "entities": [
                {
                    "entity_schema": "fxsharing",
                    "attributes": {
                        "id": str(share.id),
                        "shortcode": share.shortcode,
                        "title": share.title,
                        "reason": "User-generated link collection.",
                    },
                }
            ],
            "relationships": [
                {
                    "source_entity_schema": "fxsharing",
                    "source_id": str(share.id),
                    "target_entity_schema": "fxsharing_url",
                    "target_id": str(link.id),
                    "relationship_schema": "fxsharing_share",
                }
            ],
        },
    }


@shared_task(
    base=BaseTaskWithRetry,
    autoretry_for=(requests.exceptions.RequestException,),
)
def submit_link_to_cinder(link_id):
    from .models import Link

    if not settings.CINDER_URL:
        logger.error("submit_link_to_cinder: CINDER_URL not set!")
        return
    if not settings.CINDER_API_TOKEN:
        logger.error("submit_link_to_cinder: CINDER_API_TOKEN not set!")
        return

    try:
        link = Link.objects.select_related("share").get(id=link_id)
    except Link.DoesNotExist:
        logger.warning("submit_link_to_cinder: link %s does not exist", link_id)
        return

    payload = build_cinder_workflow_event(link, link.share)
    response = requests.post(
        settings.CINDER_API_ENDPOINT,
        json=payload,
        headers={"Authorization": f"Bearer {settings.CINDER_API_TOKEN}"},
        timeout=10,
    )
    response.raise_for_status()


def build_cinder_share_report_event(share, reason):
    return {
        "event_name": "link_collections_reporting",
        "entity": {
            "entity_schema": "fxsharing",
            "attributes": {
                "id": str(share.id),
                "shortcode": share.shortcode,
                "title": share.title,
                "reason": f"User-reported abuse: {reason}",
            },
        },
    }


@shared_task(
    base=BaseTaskWithRetry,
    autoretry_for=(requests.exceptions.RequestException,),
)
def submit_share_to_cinder(share_id, reason):
    from .models import Share

    if not settings.CINDER_URL:
        logger.error("submit_share_to_cinder: CINDER_URL not set!")
        return
    if not settings.CINDER_API_TOKEN:
        logger.error("submit_share_to_cinder: CINDER_API_TOKEN not set!")
        return

    try:
        share = Share.objects.get(id=share_id)
    except Share.DoesNotExist:
        logger.warning("submit_share_to_cinder: share %s does not exist", share_id)
        return

    payload = build_cinder_share_report_event(share, reason)
    response = requests.post(
        settings.CINDER_API_ENDPOINT,
        json=payload,
        headers={"Authorization": f"Bearer {settings.CINDER_API_TOKEN}"},
        timeout=10,
    )
    response.raise_for_status()


@shared_task(
    base=BaseTaskWithRetry,
    autoretry_for=(requests.exceptions.RequestException,),
)
def purge_cdn_cache(shortcodes):
    """Purge share pages from Fastly by surrogate key so a takedown is immediate.

    Each shortcode is the ``Surrogate-Key`` set on its share page. No-op unless
    ``FASTLY_PURGE_ENABLED`` and credentials are configured, so local/dev do
    nothing.
    """
    if not settings.FASTLY_PURGE_ENABLED:
        return

    if not (settings.FASTLY_API_TOKEN and settings.FASTLY_SERVICE_ID):
        logger.warning("Fastly purge enabled but token/service id missing; skipping")
        return

    headers = {
        "Fastly-Key": settings.FASTLY_API_TOKEN,
        "Accept": "application/json",
    }
    base = f"{settings.FASTLY_API_URL.rstrip('/')}/service/{settings.FASTLY_SERVICE_ID}"
    for shortcode in shortcodes:
        response = requests.post(
            f"{base}/purge/{shortcode}", headers=headers, timeout=10
        )
        response.raise_for_status()
        logger.info("purged CDN cache for shortcode=%s", shortcode)


def _all_link_ids(share):
    """Yield link id strings for ``share`` and every nested share (depth-first)."""
    for link_id in share.links.values_list("id", flat=True):
        yield str(link_id)
    for nested in share.nested_shares.all():
        yield from _all_link_ids(nested)


def _cinder_signatures(link_ids):
    """Return Cinder submission signatures for ``link_ids``.

    Returns an empty list (and logs) when Cinder is not configured, so callers
    can unconditionally concatenate the result into a larger dispatch group.
    """
    for name in ("CINDER_URL", "CINDER_API_TOKEN", "CINDER_API_ENDPOINT"):
        if not getattr(settings, name):
            logger.error("%s is not set!", name)
            return []

    return [submit_link_to_cinder.s(link_id) for link_id in link_ids]


@shared_task(base=BaseTaskWithRetry)
def process_new_share(share_id):
    """Fan out preview + safety processing for a newly created share.

    Enqueued once per create-share request (after commit), so the web request
    makes a single broker round trip regardless of how many links the
    collection holds. The per-link ``fetch_link_preview`` tasks and Cinder
    submissions are dispatched here, in the worker, as a single ``group`` so
    the whole fan-out is one broker operation. Building one group rather than a
    loop of ``.delay()`` calls also means a retry (the task auto-retries on
    error) replays a single dispatch instead of re-enqueuing previews link by
    link.
    """
    from .models import Share

    try:
        share = Share.objects.get(id=share_id)
    except Share.DoesNotExist:
        logger.warning("process_new_share: share %s does not exist", share_id)
        return

    link_ids = list(_all_link_ids(share))
    if not link_ids:
        return

    signatures = [fetch_link_preview.s(link_id) for link_id in link_ids]
    signatures += _cinder_signatures(link_ids)

    group(signatures).apply_async()

import requests
from bs4 import BeautifulSoup
from celery import shared_task
from celery.contrib.django.task import DjangoTask
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


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

    favicon_tag = soup.find("link", rel=lambda r: r and "icon" in r, href=True)
    favicon_url = (
        requests.compat.urljoin(link.url, favicon_tag["href"])[:2048]
        if favicon_tag
        else ""
    )

    Link.objects.filter(id=link_id).update(
        favicon_url=favicon_url,
        preview_title=og_tags.get("title", "")[:255],
        preview_description=og_tags.get("description", ""),
        preview_image_url=og_tags.get("image", "")[:2048],
    )

    logger.info("stored preview for %s: title=%r", link.url, og_tags.get("title", ""))


@shared_task(base=BaseTaskWithRetry)
def check_link_safety(link_id):
    # Stub: Web Risk API integration would go here
    pass

import secrets
import string
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from fxsharing.soft_delete import SoftDeleteQuerySet

SHORTCODE_CHARS = string.ascii_letters + string.digits


def generate_shortcode():
    return "".join(secrets.choice(SHORTCODE_CHARS) for _ in range(10))


class ShareStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACTIVE = "active", "Active"
    UNDER_REVIEW = "under_review", "Under Review (User Reported)"
    FLAGGED_BY_SYSTEM = "flagged_by_system", "Flagged by System"
    BLOCKED = "blocked", "Blocked"
    EXPIRED = "expired", "Expired"


class SafetyStatus(models.TextChoices):
    UNKNOWN = "unknown", "Unknown"
    SAFE = "safe", "Safe"
    UNSAFE = "unsafe", "Unsafe"


class SoftDeleteManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Share(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shares",
    )
    shortcode = models.CharField(max_length=16, unique=True, default=generate_shortcode)
    status = models.CharField(
        max_length=32,
        choices=ShareStatus,
        default=ShareStatus.ACTIVE,
    )
    idempotency_key = models.CharField(
        max_length=64, null=True, blank=True, unique=True
    )
    title = models.CharField(max_length=255)
    parent_share = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="nested_shares",
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = SoftDeleteManager()
    all_objects = models.Manager.from_queryset(SoftDeleteQuerySet)()

    @property
    def is_expired(self):
        if self.status in (ShareStatus.EXPIRED, ShareStatus.BLOCKED):
            return True
        return self.expires_at is not None and self.expires_at <= timezone.now()

    def __str__(self):
        return self.title

    def delete(self, *args, **kwargs):
        # Soft-delete only. There is no hard-delete.
        # Nested shares cascade through this same delete(); links inherit
        # visibility via LinkManager filtering on share__deleted_at.
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])
        nested_count, nested_by_label = self.nested_shares.all().delete()
        label = self._meta.label
        result = {label: 1}
        for k, v in nested_by_label.items():
            result[k] = result.get(k, 0) + v
        return 1 + nested_count, result

    def to_dict(self, this_only=False):
        this = dict(
            id=str(self.id),
            shortcode=self.shortcode,
            status=self.status,
            title=self.title,
            expires_at=str(self.expires_at) if self.expires_at else None,
            created_at=str(self.created_at),
            user=str(self.user),
        )

        if not this_only:
            links = [link.to_dict() for link in self.links.all()]
            nested_shares = [s.to_dict() for s in self.nested_shares.all()]
            this["links"] = links + nested_shares

        if self.parent_share:
            this["parent_share"] = self.parent_share.to_dict(this_only=True)

        return this


class LinkManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(share__deleted_at__isnull=True)


class Link(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    share = models.ForeignKey(Share, on_delete=models.CASCADE, related_name="links")
    title = models.CharField(max_length=100, blank=True)
    url = models.URLField(max_length=4000)
    safety_status = models.CharField(
        max_length=16,
        choices=SafetyStatus,
        default=SafetyStatus.UNKNOWN,
    )
    favicon_url = models.URLField(max_length=2048, blank=True)
    preview_title = models.CharField(max_length=255, blank=True)
    preview_description = models.TextField(blank=True)
    preview_image_url = models.URLField(max_length=2048, blank=True)

    objects = LinkManager()
    all_objects = models.Manager()

    def __str__(self):
        return self.title or self.url

    def to_dict(self):
        return dict(
            id=str(self.id),
            share_id=str(self.share.id),
            url=self.url,
            title=self.title,
            safety_status=self.safety_status,
            favicon_url=self.favicon_url,
            preview_title=self.preview_title,
            preview_description=self.preview_description,
            preview_image_url=self.preview_image_url,
        )

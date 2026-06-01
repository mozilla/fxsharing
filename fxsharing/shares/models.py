import secrets
import string
import uuid

from django.conf import settings
from django.db import models

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
    DELETED = "deleted", "Deleted"


class SafetyStatus(models.TextChoices):
    UNKNOWN = "unknown", "Unknown"
    SAFE = "safe", "Safe"
    UNSAFE = "unsafe", "Unsafe"


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

    def __str__(self):
        return self.title

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
    preview_title = models.CharField(max_length=255, blank=True)
    preview_description = models.TextField(null=True)
    preview_image_url = models.URLField(max_length=2048, null=True)
    favicon_image_url = models.URLField(max_length=2048, null=True)

    def __str__(self):
        return self.title or self.url

    def to_dict(self):
        return dict(
            id=str(self.id),
            share_id=str(self.share.id),
            url=self.url,
            title=self.title,
            safety_status=self.safety_status,
            preview_title=self.preview_title,
            preview_description=self.preview_description,
            preview_image_url=self.preview_image_url,
            favicon_image_url=self.favicon_image_url,
        )

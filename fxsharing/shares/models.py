import secrets
import string
import uuid

import requests
from bs4 import BeautifulSoup
from django.db import models

SHORTCODE_CHARS = string.ascii_letters + string.digits


def generate_shortcode():
    return "".join(secrets.choice(SHORTCODE_CHARS) for _ in range(10))


class ShareStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    EXPIRED = "expired", "Expired"
    DELETED = "deleted", "Deleted"
    FLAGGED = "flagged", "Flagged"


class SafetyStatus(models.TextChoices):
    UNKNOWN = "unknown", "Unknown"
    SAFE = "safe", "Safe"
    UNSAFE = "unsafe", "Unsafe"


class Share(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shortcode = models.CharField(
        max_length=16, unique=True, default=generate_shortcode
    )
    status = models.CharField(
        max_length=16,
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
    preview_description = models.TextField(blank=True)
    preview_image_url = models.URLField(max_length=2048, blank=True)

    def __str__(self):
        return self.title or self.url

    def get_opengraph_data(self):
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (platform; rv:gecko-version)"
                " Gecko/gecko-trail Firefox/firefox-version"
            )
        }

        try:
            r = requests.get(self.url, headers=headers, timeout=10)
            r.raise_for_status()

            soup = BeautifulSoup(r.text, "html.parser")
            og_tags = {}

            for meta_tag in soup.find_all(
                "meta", property=lambda p: p and p.startswith("og:")
            ):
                prop = meta_tag.get("property")
                content = meta_tag.get("content")
                if prop and content:
                    og_tags[prop.replace("og:", "")] = content

            return og_tags

        except requests.exceptions.RequestException as e:
            print(f"Error fetching URL: {e}")
            return None

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
            opengraph=self.get_opengraph_data(),
        )

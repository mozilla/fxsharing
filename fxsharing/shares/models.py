import uuid

import requests
from bs4 import BeautifulSoup
from django.db import models


class Share(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # user_id = models.CharField(max_length=255)
    title = models.CharField(max_length=255)
    parent_share = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="nested_shares",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

    def to_dict(self, this_only=False):
        this = dict(
            id=str(self.id),
            created_at=str(self.created_at),
            # user_id=self.user_id,
            title=self.title,
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
    title = models.CharField(max_length=255, blank=True)
    url = models.URLField(max_length=2048)

    def __str__(self):
        return self.title or self.url

    # TODO: This needs to be
    def get_opengrah_data(self):
        headers = {
            "User-Agent": "Mozilla/5.0 (platform; rv:gecko-version) Gecko/gecko-trail Firefox/firefox-version"
        }

        try:
            r = requests.get(self.url, headers=headers)
            r.raise_for_status()  # Raise an exception for bad status codes

            soup = BeautifulSoup(r.text, "html.parser")
            og_tags = {}

            # Find all meta tags with the 'property' attribute starting with 'og:'
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
        this = dict(
            id=str(self.id),
            share_id=str(self.share.id),
            url=self.url,
            title=self.title,
            opengraph=self.get_opengrah_data(),
        )

        return this

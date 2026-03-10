import uuid

from django.db import models


class Share(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fxa_id = models.CharField(max_length=255)
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
            fxa_id=self.fxa_id,
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

    def to_dict(self):
        this = dict(
            id=str(self.id),
            share_id=str(self.share.id),
            url=self.url,
            title=self.title,
        )

        return this

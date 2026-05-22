from django.db import models
from django.utils import timezone


class SoftDeleteQuerySet(models.QuerySet):
    def delete(self):
        count = self.update(deleted_at=timezone.now())
        return count, {self.model._meta.label: count}

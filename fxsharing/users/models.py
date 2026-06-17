import uuid

from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
from django.utils import timezone

from fxsharing.soft_delete import SoftDeleteQuerySet


class UserManager(BaseUserManager.from_queryset(SoftDeleteQuerySet)):
    def create_user(self, fxa_id, **extra_fields):
        if not fxa_id:
            raise ValueError("fxa_id is required")
        user = self.model(fxa_id=fxa_id, **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, fxa_id, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(fxa_id, **extra_fields)

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fxa_id = models.CharField(max_length=32, unique=True)
    is_banned = models.BooleanField(default=False)
    # Accumulates per-link policy hits from Cinder: +1 for a Web Risk match,
    # +3 for an NCMEC/CSAM match. At or above BAN_THRESHOLD the user is
    # permanently banned and all their shares are blocked.
    badness_counter = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "fxa_id"
    REQUIRED_FIELDS = []

    objects = UserManager()
    all_objects = BaseUserManager.from_queryset(SoftDeleteQuerySet)()

    def __str__(self):
        return self.fxa_id

    def delete(self, *args, **kwargs):
        # Soft-delete only. There is no hard-delete path on this model.
        # Cascades to the user's shares (which in turn hides their links via
        # LinkManager). Already-deleted shares are untouched.
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])
        shares_count, shares_by_label = self.shares.all().delete()
        result = {self._meta.label: 1}
        for k, v in shares_by_label.items():
            result[k] = result.get(k, 0) + v
        return 1 + shares_count, result

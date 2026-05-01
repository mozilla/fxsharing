import secrets
import uuid
from datetime import timedelta

from django.db import models
from django.utils import timezone


def _default_session_token():
    return secrets.token_urlsafe(32)


def _default_expires_at():
    return timezone.now() + timedelta(days=365)


class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fxa_id = models.CharField(max_length=255, unique=True)
    is_banned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.fxa_id


class Session(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    session_token = models.CharField(
        max_length=255, unique=True, default=_default_session_token
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=_default_expires_at)

    def __str__(self):
        return f"Session for {self.user.fxa_id}"

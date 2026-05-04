from unittest.mock import MagicMock, patch

from django.db import IntegrityError
from django.test import TestCase

from fxsharing.users.adapter import FxASocialAccountAdapter
from fxsharing.users.models import User


class TestFxASocialAccountAdapter(TestCase):
    def test_populate_user_sets_fxa_id(self):
        adapter = FxASocialAccountAdapter()
        sociallogin = MagicMock()
        sociallogin.account.uid = "a1b2c3d4e5f6789abc"
        user = User()
        with patch.object(
            FxASocialAccountAdapter.__bases__[0],
            "populate_user",
            return_value=user,
        ):
            result = adapter.populate_user(None, sociallogin, {})
        assert result.fxa_id == "a1b2c3d4e5f6789abc"


class TestUserModel(TestCase):
    def test_creates_user(self):
        user = User.objects.create_user(fxa_id="a1b2c3d4e5f6789abc")
        assert user.fxa_id == "a1b2c3d4e5f6789abc"
        assert user.is_banned is False
        assert user.created_at is not None

    def test_fxa_id_is_unique(self):
        User.objects.create_user(fxa_id="a1b2c3d4e5f6789abc")
        with self.assertRaises(IntegrityError):
            User.objects.create_user(fxa_id="a1b2c3d4e5f6789abc")

    def test_str(self):
        user = User.objects.create_user(fxa_id="a1b2c3d4e5f6789abc")
        assert str(user) == "a1b2c3d4e5f6789abc"

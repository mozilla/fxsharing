from unittest.mock import MagicMock, patch

from django.db import IntegrityError
from django.test import TestCase

from allauth.socialaccount.models import SocialAccount

from fxsharing.users.adapter import FxASocialAccountAdapter, user_display
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


class TestUserDisplay(TestCase):
    def test_returns_email_from_social_account(self):
        user = User.objects.create_user(fxa_id="a1b2c3d4e5f6789abc")
        SocialAccount.objects.create(
            user=user,
            provider="fxa",
            uid=user.fxa_id,
            extra_data={"email": "jane@example.com"},
        )
        assert user_display(user) == "jane@example.com"

    def test_falls_back_to_fxa_id_without_social_account(self):
        user = User.objects.create_user(fxa_id="a1b2c3d4e5f6789abc")
        assert user_display(user) == "a1b2c3d4e5f6789abc"

    def test_falls_back_to_fxa_id_when_email_missing(self):
        user = User.objects.create_user(fxa_id="a1b2c3d4e5f6789abc")
        SocialAccount.objects.create(
            user=user,
            provider="fxa",
            uid=user.fxa_id,
            extra_data={},
        )
        assert user_display(user) == "a1b2c3d4e5f6789abc"


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


class TestSoftDeleteUser(TestCase):
    def test_delete_sets_deleted_at_and_hides_from_default_manager(self):
        from fxsharing.shares.models import Share

        user = User.objects.create_user(fxa_id="softdel1")
        user.delete()
        assert not User.objects.filter(pk=user.pk).exists()
        assert User.all_objects.filter(pk=user.pk).exists()
        assert User.all_objects.get(pk=user.pk).deleted_at is not None
        # Sanity: confirm Share import wasn't broken by cross-app import
        assert Share.objects.filter(user=user).count() == 0

    def test_delete_cascades_to_shares_and_links(self):
        from fxsharing.shares.models import Link, Share

        user = User.objects.create_user(fxa_id="softdel2")
        share = Share.objects.create(title="S", user=user)
        link = Link.objects.create(share=share, url="https://example.com")
        count, by_label = user.delete()
        assert count == 2
        assert by_label == {"users.User": 1, "shares.Share": 1}
        assert not Share.objects.filter(pk=share.pk).exists()
        assert not Link.objects.filter(pk=link.pk).exists()
        assert Share.all_objects.get(pk=share.pk).deleted_at is not None

    def test_soft_deleted_user_not_authenticatable(self):
        user = User.objects.create_user(fxa_id="softdel3")
        user.delete()
        from django.contrib.auth import get_user_model

        UserModel = get_user_model()
        with self.assertRaises(UserModel.DoesNotExist):
            UserModel.objects.get(fxa_id="softdel3")

    def test_fxa_id_unique_blocks_resignup_after_soft_delete(self):
        user = User.objects.create_user(fxa_id="softdel4")
        user.delete()
        with self.assertRaises(IntegrityError):
            User.objects.create_user(fxa_id="softdel4")

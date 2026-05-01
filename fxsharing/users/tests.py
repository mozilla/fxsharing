from django.test import TestCase

from fxsharing.users.models import Session, User


class TestUserModel(TestCase):
    def test_creates_user(self):
        user = User.objects.create(fxa_id="abc123")
        assert user.fxa_id == "abc123"
        assert user.is_banned is False
        assert user.created_at is not None

    def test_fxa_id_is_unique(self):
        User.objects.create(fxa_id="abc123")
        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            User.objects.create(fxa_id="abc123")

    def test_str(self):
        user = User.objects.create(fxa_id="abc123")
        assert str(user) == "abc123"


class TestSessionModel(TestCase):
    def setUp(self):
        self.user = User.objects.create(fxa_id="abc123")

    def test_creates_session(self):
        session = Session.objects.create(user=self.user)
        assert session.user == self.user
        assert session.session_token is not None
        assert len(session.session_token) > 0

    def test_session_token_is_unique(self):
        s1 = Session.objects.create(user=self.user)
        s2 = Session.objects.create(user=self.user)
        assert s1.session_token != s2.session_token

    def test_expires_at_defaults_to_one_year(self):
        session = Session.objects.create(user=self.user)
        delta = session.expires_at - session.created_at
        assert abs(delta.days - 365) <= 1

    def test_session_deleted_when_user_deleted(self):
        Session.objects.create(user=self.user)
        self.user.delete()
        assert Session.objects.count() == 0

    def test_str(self):
        session = Session.objects.create(user=self.user)
        assert str(session) == "Session for abc123"

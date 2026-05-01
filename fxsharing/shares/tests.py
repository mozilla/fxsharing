import json
import uuid

from allauth.account.signals import user_logged_in, user_logged_out
from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.test import RequestFactory, TestCase
from django.urls import reverse

from fxsharing.shares.middleware import OAuthLoginCompleteCookieMiddleware
from fxsharing.shares.models import Share

User = get_user_model()


class TestCreateShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="alice")

    def setUp(self):
        self.client.force_login(self.user)

    def test_returns_url_on_valid_payload(self):
        payload = {
            "type": "tabs",
            "title": "My Links",
            "links": [{"url": "https://example.com", "title": "Example"}],
        }
        response = self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 201
        data = response.json()
        assert "url" in data

    def test_assigns_request_user_to_share(self):
        payload = {
            "type": "tabs",
            "title": "My Links",
            "links": [{"url": "https://example.com", "title": "Example"}],
        }
        response = self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 201
        share = Share.objects.get()
        assert share.user == self.user

    def test_nested_shares_inherit_request_user(self):
        payload = {
            "type": "tabs",
            "title": "Top",
            "links": [
                {"url": "https://example.com", "title": "Example"},
                {
                    "type": "bookmarks",
                    "title": "Nested folder",
                    "links": [
                        {"url": "https://mozilla.org", "title": "Mozilla"},
                        {
                            "type": "bookmarks",
                            "title": "Deeper folder",
                            "links": [
                                {"url": "https://rust-lang.org", "title": "Rust"},
                            ],
                        },
                    ],
                },
            ],
        }
        response = self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 201
        assert Share.objects.count() == 3
        assert not Share.objects.exclude(user=self.user).exists()

    def test_creates_links(self):
        payload = {
            "type": "tabs",
            "title": "My Links",
            "links": [
                {"url": "https://example.com", "title": "Example"},
                {"url": "https://mozilla.org", "title": "Mozilla"},
            ],
        }
        response = self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 201
        share = Share.objects.get()
        api_response = self.client.get(reverse("api_share", args=[share.id]))
        data = api_response.json()
        assert len(data["links"]) == 2


class TestCreateShareRequiresAuth(TestCase):
    def test_anonymous_post_is_rejected(self):
        payload = {
            "type": "tabs",
            "title": "My Links",
            "links": [{"url": "https://example.com", "title": "Example"}],
        }
        response = self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 401
        assert Share.objects.count() == 0


class TestApiShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="alice")

    def test_returns_share_json(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(reverse("api_share", args=[share.id]))
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Test Share"
        assert data["id"] == str(share.id)

    def test_returns_404_for_unknown_id(self):
        response = self.client.get(reverse("api_share", args=[uuid.uuid4()]))
        assert response.status_code == 404


class TestViewShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="alice")

    def test_returns_200(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(reverse("view_share", args=[share.id]))
        assert response.status_code == 200


class TestDockerflowEndpoints(TestCase):
    def test_lbheartbeat_get(self):
        response = self.client.get("/__lbheartbeat__")
        assert response.status_code == 200

    def test_heartbeat_get(self):
        response = self.client.get("/__heartbeat__")
        assert response.status_code == 200

    def test_version_get(self):
        response = self.client.get("/__version__")
        assert response.status_code == 200


class TestOAuthLoginCompleteCookie(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="alice")

    def setUp(self):
        self.factory = RequestFactory()

    def _run(self, signal=None):
        def view(request):
            if signal is not None:
                signal.send(sender=User, request=request, user=self.user)
            return HttpResponse()

        middleware = OAuthLoginCompleteCookieMiddleware(view)
        return middleware(self.factory.get("/"))

    def test_sets_auth_cookie_when_login_signal_fires(self):
        response = self._run(signal=user_logged_in)
        cookie = response.cookies["auth"]
        assert cookie.value == "1"
        assert cookie["httponly"]
        assert cookie["samesite"] == "Lax"
        assert cookie["path"] == "/"

    def test_no_auth_cookie_on_request_without_login(self):
        response = self._run()
        assert "auth" not in response.cookies

    def test_clears_auth_cookie_when_logout_signal_fires(self):
        response = self._run(signal=user_logged_out)
        cookie = response.cookies["auth"]
        assert cookie.value == ""
        assert cookie["max-age"] == 0

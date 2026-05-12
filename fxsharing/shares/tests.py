import json
import uuid

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.test import RequestFactory, TestCase
from django.urls import reverse

from allauth.account.signals import user_logged_in, user_logged_out

from fxsharing.shares.middleware import OAuthLoginCompleteCookieMiddleware
from fxsharing.shares.models import Link, SafetyStatus, Share, ShareStatus

User = get_user_model()


class TestShareModel(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6sharemodel")

    def setUp(self):
        self.client.force_login(self.user)

    def test_shortcode_auto_generated(self):
        share = Share.objects.create(title="Test", user=self.user)
        assert share.shortcode
        assert len(share.shortcode) == 10

    def test_shortcode_is_unique(self):
        s1 = Share.objects.create(title="First", user=self.user)
        s2 = Share.objects.create(title="Second", user=self.user)
        assert s1.shortcode != s2.shortcode

    def test_status_defaults_to_active(self):
        share = Share.objects.create(title="Test", user=self.user)
        assert share.status == ShareStatus.ACTIVE

    def test_idempotency_key_nullable(self):
        # Nested shares don't have an idempotency key
        parent = Share.objects.create(title="Parent", user=self.user)
        nested = Share.objects.create(
            title="Nested", user=self.user, parent_share=parent
        )
        assert nested.idempotency_key is None

    def test_expires_at_set_via_api(self):
        payload = {
            "type": "tabs",
            "title": "Test",
            "links": [{"url": "https://example.com", "title": "Example"}],
        }
        self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        share = Share.objects.filter(parent_share__isnull=True).first()
        assert share.expires_at is not None


class TestLinkModel(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6linkmodel")

    def setUp(self):
        self.share = Share.objects.create(title="Test Share", user=self.user)

    def test_safety_status_defaults_to_unknown(self):
        link = Link.objects.create(share=self.share, url="https://example.com")
        assert link.safety_status == SafetyStatus.UNKNOWN

    def test_preview_fields_default_to_blank(self):
        link = Link.objects.create(share=self.share, url="https://example.com")
        assert link.preview_title == ""
        assert link.preview_description == ""
        assert link.preview_image_url == ""

    def test_to_dict_includes_new_fields(self):
        link = Link.objects.create(
            share=self.share,
            url="https://example.com",
            preview_title="Example",
            preview_description="A site",
            preview_image_url="https://example.com/img.png",
        )
        d = link.to_dict()
        assert d["safety_status"] == SafetyStatus.UNKNOWN
        assert d["preview_title"] == "Example"
        assert d["preview_description"] == "A site"
        assert d["preview_image_url"] == "https://example.com/img.png"


class TestCreateShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6alice")

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
        api_response = self.client.get(reverse("api_share", args=[share.shortcode]))
        data = api_response.json()
        assert len(data["links"]) == 2

    def test_duplicate_request_returns_same_url(self):
        payload = {
            "type": "tabs",
            "title": "My Links",
            "links": [{"url": "https://example.com", "title": "Example"}],
        }
        body = json.dumps(payload)
        r1 = self.client.post(
            reverse("create_share"), data=body, content_type="application/json"
        )
        r2 = self.client.post(
            reverse("create_share"), data=body, content_type="application/json"
        )
        assert r1.json()["url"] == r2.json()["url"]
        assert Share.objects.filter(parent_share__isnull=True).count() == 1

    def test_accepts_bookmarks_type(self):
        payload = {
            "type": "bookmarks",
            "title": "My Bookmarks",
            "links": [{"url": "https://example.com", "title": "Example"}],
        }
        response = self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 201

    def test_rejects_bookmark_folder_type(self):
        payload = {
            "type": "bookmark_folder",
            "title": "My Bookmarks",
            "links": [{"url": "https://example.com", "title": "Example"}],
        }
        response = self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 400


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
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6alice")

    def test_returns_share_json(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(reverse("api_share", args=[share.shortcode]))
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Test Share"
        assert data["id"] == str(share.id)

    def test_returns_404_for_unknown_shortcode(self):
        response = self.client.get(reverse("api_share", args=["doesnotexist"]))
        assert response.status_code == 404


class TestViewShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6alice")

    def test_returns_200(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
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
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6alice")

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

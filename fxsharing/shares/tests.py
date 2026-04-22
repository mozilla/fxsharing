import json
import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

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
        assert response.status_code == 200
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
        assert response.status_code == 200
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
        assert response.status_code == 200
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
        assert response.status_code == 200
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
        self.assertRedirects(
            response,
            f"{settings.LOGIN_URL}?next={reverse('create_share')}",
            fetch_redirect_response=False,
        )
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

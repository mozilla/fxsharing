import json
import uuid

from django.test import TestCase
from django.urls import reverse

from fxsharing.shares.models import Share


class TestSharesListView(TestCase):
    def test_returns_200(self):
        response = self.client.get(reverse("shares"))
        assert response.status_code == 200

    def test_lists_shares(self):
        share = Share.objects.create(title="My Share")
        response = self.client.get(reverse("shares"))
        assert share.title in response.content.decode()


class TestCreateShare(TestCase):
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
        share_id = response.json()["url"].rstrip("/").split("/")[-1]
        api_response = self.client.get(reverse("api_share", args=[share_id]))
        data = api_response.json()
        assert len(data["links"]) == 2


class TestApiShare(TestCase):
    def test_returns_share_json(self):
        share = Share.objects.create(title="Test Share")
        response = self.client.get(reverse("api_share", args=[share.id]))
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Test Share"
        assert data["id"] == str(share.id)

    def test_returns_404_for_unknown_id(self):
        response = self.client.get(reverse("api_share", args=[uuid.uuid4()]))
        assert response.status_code == 404


class TestViewShare(TestCase):
    def test_returns_200(self):
        share = Share.objects.create(title="Test Share")
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

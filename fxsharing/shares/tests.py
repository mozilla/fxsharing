import json
import uuid

from django.test import TestCase
from django.urls import reverse

from fxsharing.shares.models import Link, Share, ShareStatus, SafetyStatus


class TestSharesListView(TestCase):
    def test_returns_200(self):
        response = self.client.get(reverse("shares"))
        assert response.status_code == 200

    def test_lists_shares(self):
        share = Share.objects.create(title="My Share")
        response = self.client.get(reverse("shares"))
        assert share.title in response.content.decode()


class TestShareModel(TestCase):
    def test_shortcode_auto_generated(self):
        share = Share.objects.create(title="Test")
        assert share.shortcode
        assert len(share.shortcode) == 10

    def test_shortcode_is_unique(self):
        s1 = Share.objects.create(title="First")
        s2 = Share.objects.create(title="Second")
        assert s1.shortcode != s2.shortcode

    def test_status_defaults_to_active(self):
        share = Share.objects.create(title="Test")
        assert share.status == ShareStatus.ACTIVE

    def test_idempotency_key_nullable(self):
        # Nested shares don't have an idempotency key
        parent = Share.objects.create(title="Parent")
        nested = Share.objects.create(title="Nested", parent_share=parent)
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
    def setUp(self):
        self.share = Share.objects.create(title="Test Share")

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
        assert response.status_code == 200

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

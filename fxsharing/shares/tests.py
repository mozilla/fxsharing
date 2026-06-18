import hashlib
import hmac
import importlib
import json
import socket
from datetime import timedelta
from io import StringIO
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.contrib.messages import get_messages
from django.core.management import call_command
from django.core.management.base import CommandError
from django.http import Http404, HttpResponse
from django.test import (
    RequestFactory,
    SimpleTestCase,
    TestCase,
    override_settings,
)
from django.urls import clear_url_caches, reverse
from django.utils import timezone

import requests
from allauth.account.signals import user_logged_in, user_logged_out
from celery import shared_task

from fxsharing.shares.middleware import OAuthLoginCompleteCookieMiddleware
from fxsharing.shares.models import (
    DeadLetterTask,
    Link,
    SafetyStatus,
    Share,
    ShareStatus,
)
from fxsharing.shares.tasks import (
    BaseTaskWithRetry,
    fetch_link_preview,
    purge_cdn_cache,
)
from fxsharing.shares.url_safety import (
    UnsafeURLError,
    _ip_is_public,
    _resolve_and_validate,
    safe_get,
)
from fxsharing.shares.views import dev_login, page_not_found, server_error

User = get_user_model()


@shared_task(base=BaseTaskWithRetry, max_retries=0, retry_backoff=False)
def _always_failing_task(value):
    raise ValueError(f"boom: {value}")


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
        assert link.preview_description is None
        assert link.preview_image_url is None
        assert link.favicon_url == ""

    def test_to_dict_includes_new_fields(self):
        link = Link.objects.create(
            share=self.share,
            url="https://example.com",
            preview_title="Example",
            preview_description="A site",
            preview_image_url="https://example.com/img.png",
            favicon_url="https://example.com/favicon.png",
        )
        d = link.to_dict()
        assert d["safety_status"] == SafetyStatus.UNKNOWN
        assert d["preview_title"] == "Example"
        assert d["preview_description"] == "A site"
        assert d["preview_image_url"] == "https://example.com/img.png"
        assert d["favicon_url"] == "https://example.com/favicon.png"


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
        assert share.links.count() == 2

    def test_enqueues_single_dispatch_regardless_of_link_count(self):
        from fxsharing.shares import views

        payload = {
            "type": "tabs",
            "title": "My Links",
            "links": [
                {"url": f"https://example.com/{i}", "title": f"Link {i}"}
                for i in range(10)
            ],
        }
        response = self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 201
        share = Share.objects.get()
        views.process_new_share.delay_on_commit.assert_called_once_with(str(share.id))

    def test_duplicate_request_creates_distinct_share(self):
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
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["url"] != r2.json()["url"]
        assert Share.objects.filter(parent_share__isnull=True).count() == 2

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


@override_settings(MAX_ACTIVE_SHARES=3)
class TestCreateShareActiveLimit(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6limit")
        cls.other = User.objects.create_user(fxa_id="a1b2c3d4e5f6other")

    def setUp(self):
        self.client.force_login(self.user)

    def _make_live_share(self, title, user=None, **kwargs):
        """A top-level share that counts: ACTIVE status, not yet expired."""
        kwargs.setdefault("expires_at", timezone.now() + timedelta(days=7))
        return Share.objects.create(title=title, user=user or self.user, **kwargs)

    def _post(self):
        payload = {
            "type": "tabs",
            "title": "My Links",
            "links": [{"url": "https://example.com", "title": "Example"}],
        }
        return self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_under_limit_succeeds(self):
        self._make_live_share("A")
        self._make_live_share("B")
        response = self._post()
        assert response.status_code == 201

    def test_at_limit_returns_429(self):
        for i in range(3):
            self._make_live_share(f"S{i}")
        response = self._post()
        assert response.status_code == 429
        assert "error" in response.json()
        # The rejected request created no share.
        assert Share.objects.filter(user=self.user).count() == 3

    def test_soft_deleted_shares_do_not_count(self):
        # Three shares created then soft-deleted no longer count against the cap.
        for i in range(3):
            self._make_live_share(f"S{i}").delete()
        response = self._post()
        assert response.status_code == 201

    def test_nested_shares_do_not_count(self):
        # Two top-level shares (one with two nested sub-shares) = 4 rows but only
        # 2 count, so the user is still under the cap of 3.
        self._make_live_share("Top1")
        parent = self._make_live_share("Top2")
        Share.objects.create(title="Nested1", user=self.user, parent_share=parent)
        Share.objects.create(title="Nested2", user=self.user, parent_share=parent)
        response = self._post()
        assert response.status_code == 201

    def test_expired_shares_do_not_count(self):
        # Shares past their expires_at no longer count, even if still ACTIVE
        # (expiry is lazy — nothing flips status to EXPIRED).
        for i in range(3):
            self._make_live_share(
                f"Old{i}", expires_at=timezone.now() - timedelta(days=1)
            )
        response = self._post()
        assert response.status_code == 201

    def test_non_active_status_shares_do_not_count(self):
        # Pending, under-review, and flagged shares are excluded from the count
        # even though they are non-deleted and not yet expired.
        for i, status in enumerate(
            [
                ShareStatus.PENDING,
                ShareStatus.UNDER_REVIEW,
                ShareStatus.FLAGGED_BY_SYSTEM,
            ]
        ):
            self._make_live_share(f"NonActive{i}", status=status)
        response = self._post()
        assert response.status_code == 201

    def test_limit_is_per_user(self):
        for i in range(3):
            self._make_live_share(f"Other{i}", user=self.other)
        # self.user is at zero; the other user's shares don't count.
        response = self._post()
        assert response.status_code == 201


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

    def test_anonymous_post_stores_link_count_in_session(self):
        payload = {
            "type": "tabs",
            "title": "My Links",
            "links": [
                {"url": "https://example.com", "title": "A"},
                {"url": "https://mozilla.org", "title": "B"},
                {"url": "https://firefox.com", "title": "C"},
            ],
        }
        self.client.post(
            reverse("create_share"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert self.client.session["pending_link_count"] == 3

    def test_anonymous_post_with_invalid_json_does_not_error(self):
        response = self.client.post(
            reverse("create_share"),
            data="not json",
            content_type="application/json",
        )
        assert response.status_code == 401
        assert "pending_link_count" not in self.client.session


class TestAuthComplete(TestCase):
    def test_returns_200(self):
        response = self.client.get(reverse("auth_complete"))
        assert response.status_code == 200

    def test_defaults_to_8_items_when_no_session_count(self):
        response = self.client.get(reverse("auth_complete"))
        assert response.context["link_count"] == 8
        assert b'count="8"' in response.content

    def test_uses_session_link_count(self):
        session = self.client.session
        session["pending_link_count"] = 5
        session.save()
        response = self.client.get(reverse("auth_complete"))
        assert response.context["link_count"] == 5
        assert b'count="5"' in response.content

    def test_clears_session_link_count_after_render(self):
        session = self.client.session
        session["pending_link_count"] = 5
        session.save()
        self.client.get(reverse("auth_complete"))
        assert "pending_link_count" not in self.client.session


class TestViewShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6alice")

    def test_returns_200(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
        assert response.status_code == 200

    def test_expired_status_returns_410(self):
        share = Share.objects.create(
            title="Share", user=self.user, status=ShareStatus.EXPIRED
        )
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
        assert response.status_code == 410
        assert b"aren't available" in response.content

    def test_blocked_status_returns_410(self):
        share = Share.objects.create(
            title="Share", user=self.user, status=ShareStatus.BLOCKED
        )
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
        assert response.status_code == 410
        assert b"aren't available" in response.content

    def test_past_expires_at_returns_410(self):
        share = Share.objects.create(
            title="Timed-out Share",
            user=self.user,
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
        assert response.status_code == 410
        assert b"aren't available" in response.content

    def test_future_expires_at_returns_200(self):
        share = Share.objects.create(
            title="Active Share",
            user=self.user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
        assert response.status_code == 200

    def test_download_banner_always_rendered(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(
            reverse("view_share", args=[share.shortcode]),
            HTTP_USER_AGENT="Chrome/109.0",
        )
        assert b"Created with Firefox" in response.content
        assert b'class="fx-banner not-fx"' in response.content

    def test_download_banner_markup_is_user_agent_independent(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        chrome = self.client.get(
            reverse("view_share", args=[share.shortcode]),
            HTTP_USER_AGENT="Chrome/109.0",
        )
        firefox = self.client.get(
            reverse("view_share", args=[share.shortcode]),
            HTTP_USER_AGENT="Mozilla/5.0 Gecko/20100101 Firefox/109.0",
        )
        assert chrome.content == firefox.content

    def test_active_share_is_edge_cacheable(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
        assert "max-age=" in response["Surrogate-Control"]
        assert response["Surrogate-Key"] == share.shortcode
        assert "no-cache" in response["Cache-Control"]
        assert "User-Agent" in response["Vary"]

    def test_blocked_share_is_not_edge_cached(self):
        share = Share.objects.create(
            title="Share", user=self.user, status=ShareStatus.BLOCKED
        )
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
        assert "Surrogate-Control" not in response
        assert "no-store" in response["Cache-Control"]


class TestReportShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6alice")

    def test_report_sets_status_under_review(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.post(
            reverse("report_share", args=[share.shortcode]),
            data={"reason": "spam"},
        )
        assert response.status_code == 302
        assert response["Location"] == reverse("view_share", args=[share.shortcode])
        assert [str(m) for m in get_messages(response.wsgi_request)] == [
            "Your report has been submitted"
        ]
        share.refresh_from_db()
        assert share.status == "under_review"

    def test_report_returns_404_for_unknown_shortcode(self):
        response = self.client.post(
            reverse("report_share", args=["doesnotexist"]),
            data={"reason": "spam"},
        )
        assert response.status_code == 404

    def test_report_rejects_invalid_reason(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.post(
            reverse("report_share", args=[share.shortcode]),
            data={"reason": "notareason"},
        )
        assert response.status_code == 400

    def test_report_dispatches_submit_share_to_cinder_task(self):
        from fxsharing.shares import views

        share = Share.objects.create(title="Test Share", user=self.user)
        self.client.post(
            reverse("report_share", args=[share.shortcode]),
            data={"reason": "spam"},
        )

        # conftest patches submit_share_to_cinder in views to a MagicMock;
        # .delay_on_commit is the call we count.
        views.submit_share_to_cinder.delay_on_commit.assert_called_once_with(
            str(share.pk), "spam"
        )


class TestRecordClientEvent(TestCase):
    def test_valid_event_returns_204(self):
        response = self.client.post(
            reverse("record_client_event"),
            data=json.dumps({"event_type": "copy_link", "properties": {}}),
            content_type="application/json",
        )
        assert response.status_code == 204

    def test_all_valid_event_types_accepted(self):
        for event_type in (
            "copy_link",
            "link_click",
            "report_dialog_open",
            "cta_click",
            "tou_click",
            "aup_click",
        ):
            response = self.client.post(
                reverse("record_client_event"),
                data=json.dumps({"event_type": event_type, "properties": {}}),
                content_type="application/json",
            )
            assert response.status_code == 204, f"Expected 204 for {event_type}"

    def test_unknown_event_type_returns_400(self):
        response = self.client.post(
            reverse("record_client_event"),
            data=json.dumps({"event_type": "unknown_event", "properties": {}}),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_invalid_json_returns_400(self):
        response = self.client.post(
            reverse("record_client_event"),
            data="not json",
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_get_request_returns_405(self):
        response = self.client.get(reverse("record_client_event"))
        assert response.status_code == 405


class TestProductMetrics(TestCase):
    """Product counters fire on the right outcomes with low-cardinality attrs.

    The counters are patched on the metrics module so the assertions don't
    depend on a live OTel exporter (none is active in tests).
    """

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6metrics")

    def _payload(self):
        return json.dumps(
            {
                "type": "tabs",
                "title": "My Links",
                "links": [{"url": "https://example.com", "title": "Example"}],
            }
        )

    def test_view_increments_share_viewed_on_live_share(self):
        share = Share.objects.create(title="Live", user=self.user)
        with patch("fxsharing.shares.metrics.share_viewed") as counter:
            self.client.get(reverse("view_share", args=[share.shortcode]))
        counter.add.assert_called_once_with(1)

    def test_view_does_not_increment_for_expired_share(self):
        share = Share.objects.create(
            title="Gone", user=self.user, status=ShareStatus.EXPIRED
        )
        with patch("fxsharing.shares.metrics.share_viewed") as counter:
            self.client.get(reverse("view_share", args=[share.shortcode]))
        counter.add.assert_not_called()

    def test_create_increments_with_created_outcome(self):
        self.client.force_login(self.user)
        with patch("fxsharing.shares.metrics.share_created") as counter:
            response = self.client.post(
                reverse("create_share"),
                data=self._payload(),
                content_type="application/json",
            )
        assert response.status_code == 201
        counter.add.assert_called_once_with(1, {"outcome": "created"})

    @override_settings(MAX_ACTIVE_SHARES=1)
    def test_create_increments_with_limit_reached_outcome(self):
        self.client.force_login(self.user)
        Share.objects.create(
            title="Existing",
            user=self.user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        with patch("fxsharing.shares.metrics.share_created") as counter:
            response = self.client.post(
                reverse("create_share"),
                data=self._payload(),
                content_type="application/json",
            )
        assert response.status_code == 429
        counter.add.assert_called_once_with(1, {"outcome": "limit_reached"})

    def test_create_increments_with_unauthenticated_outcome(self):
        with patch("fxsharing.shares.metrics.share_created") as counter:
            response = self.client.post(
                reverse("create_share"),
                data=self._payload(),
                content_type="application/json",
            )
        assert response.status_code == 401
        counter.add.assert_called_once_with(1, {"outcome": "unauthenticated"})

    def test_create_increments_with_invalid_outcome(self):
        self.client.force_login(self.user)
        with patch("fxsharing.shares.metrics.share_created") as counter:
            response = self.client.post(
                reverse("create_share"),
                data="not json",
                content_type="application/json",
            )
        assert response.status_code == 400
        counter.add.assert_called_once_with(1, {"outcome": "invalid"})

    def test_report_increments_share_reported(self):
        share = Share.objects.create(title="Reported", user=self.user)
        with patch("fxsharing.shares.metrics.share_reported") as counter:
            self.client.post(
                reverse("report_share", args=[share.shortcode]),
                data={"reason": "spam"},
            )
        counter.add.assert_called_once_with(1)

    def test_invalid_report_does_not_increment(self):
        share = Share.objects.create(title="Reported", user=self.user)
        with patch("fxsharing.shares.metrics.share_reported") as counter:
            self.client.post(
                reverse("report_share", args=[share.shortcode]),
                data={"reason": "notareason"},
            )
        counter.add.assert_not_called()

    def test_client_event_increments_with_event_type(self):
        with patch("fxsharing.shares.metrics.client_event") as counter:
            self.client.post(
                reverse("record_client_event"),
                data=json.dumps({"event_type": "copy_link", "properties": {}}),
                content_type="application/json",
            )
        counter.add.assert_called_once_with(1, {"event_type": "copy_link"})

    def test_unknown_client_event_does_not_increment(self):
        with patch("fxsharing.shares.metrics.client_event") as counter:
            self.client.post(
                reverse("record_client_event"),
                data=json.dumps({"event_type": "bogus", "properties": {}}),
                content_type="application/json",
            )
        counter.add.assert_not_called()


class TestSoftDeleteShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6softdel")

    def test_delete_sets_deleted_at_and_hides_from_default_manager(self):
        share = Share.objects.create(title="Soft", user=self.user)
        count, by_label = share.delete()
        assert count == 1
        assert by_label == {"shares.Share": 1}
        assert not Share.objects.filter(pk=share.pk).exists()
        assert Share.all_objects.filter(pk=share.pk).exists()
        assert Share.all_objects.get(pk=share.pk).deleted_at is not None

    def test_queryset_delete_returns_count_tuple(self):
        Share.objects.create(title="A", user=self.user)
        Share.objects.create(title="B", user=self.user)
        count, by_label = Share.objects.filter(user=self.user).delete()
        assert count == 2
        assert by_label == {"shares.Share": 2}

    def test_links_hidden_when_share_soft_deleted(self):
        share = Share.objects.create(title="Soft", user=self.user)
        link = Link.objects.create(share=share, url="https://example.com")
        share.delete()
        assert not Link.objects.filter(pk=link.pk).exists()
        assert Link.all_objects.filter(pk=link.pk).exists()

    def test_bulk_queryset_delete_is_soft(self):
        Share.objects.create(title="A", user=self.user)
        Share.objects.create(title="B", user=self.user)
        Share.objects.filter(user=self.user).delete()
        assert Share.objects.count() == 0
        assert Share.all_objects.count() == 2
        assert all(s.deleted_at is not None for s in Share.all_objects.all())

    def test_nested_shares_cascade_on_soft_delete(self):
        parent = Share.objects.create(title="Parent", user=self.user)
        nested = Share.objects.create(
            title="Nested", user=self.user, parent_share=parent
        )
        count, by_label = parent.delete()
        assert count == 2
        assert by_label == {"shares.Share": 2}
        assert not Share.objects.filter(pk=nested.pk).exists()
        assert Share.all_objects.get(pk=nested.pk).deleted_at is not None

    def test_view_share_404s_when_soft_deleted(self):
        share = Share.objects.create(title="Soft", user=self.user)
        share.delete()
        response = self.client.get(reverse("view_share", args=[share.shortcode]))
        assert response.status_code == 404

    def test_report_share_404s_when_soft_deleted(self):
        self.client.force_login(self.user)
        share = Share.objects.create(title="Soft", user=self.user)
        share.delete()
        response = self.client.post(
            reverse("report_share", args=[share.shortcode]),
            data={"reason": "spam"},
        )
        assert response.status_code == 404


class TestLandingView(TestCase):
    def test_returns_200(self):
        response = self.client.get(reverse("landing"))
        assert response.status_code == 200

    def test_renders_both_cta_variants(self):
        response = self.client.get(reverse("landing"))
        assert b'class="cta-button fx-only"' in response.content
        assert b'class="cta-button not-fx"' in response.content

    def test_cta_markup_is_user_agent_independent(self):
        chrome = self.client.get(
            reverse("landing"),
            HTTP_USER_AGENT="Chrome/109.0",
        )
        firefox = self.client.get(
            reverse("landing"),
            HTTP_USER_AGENT="Mozilla/5.0 Gecko/20100101 Firefox/109.0",
        )
        assert chrome.content == firefox.content


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


class TestDeadLetterTaskModel(TestCase):
    def test_str(self):
        dlq = DeadLetterTask.objects.create(
            task_name="foo.bar",
            task_id="abc-123",
            exception_class="ValueError",
        )
        assert str(dlq) == "foo.bar (abc-123)"

    def test_defaults(self):
        dlq = DeadLetterTask.objects.create(
            task_name="foo.bar",
            task_id="abc-123",
            exception_class="ValueError",
        )
        assert dlq.args == []
        assert dlq.kwargs == {}
        assert dlq.queue == ""
        assert dlq.traceback == ""


class TestBaseTaskWithRetry(TestCase):
    def test_on_failure_creates_dlq_row(self):
        task = _always_failing_task
        einfo = MagicMock()
        einfo.traceback = "Traceback (most recent call last):\n  ...\nValueError: boom"

        task.on_failure(
            exc=ValueError("boom"),
            task_id="task-xyz",
            args=("hi",),
            kwargs={"k": "v"},
            einfo=einfo,
        )

        dlq = DeadLetterTask.objects.get(task_id="task-xyz")
        assert dlq.task_name == _always_failing_task.name
        assert dlq.exception_class == "ValueError"
        assert dlq.exception_message == "boom"
        assert dlq.args == ["hi"]
        assert dlq.kwargs == {"k": "v"}
        assert "ValueError: boom" in dlq.traceback

    def test_on_retry_logs(self):
        task = _always_failing_task
        with self.assertLogs("fxsharing.shares.tasks", level="WARNING") as cm:
            task.on_retry(
                exc=ValueError("boom"),
                task_id="task-xyz",
                args=("hi",),
                kwargs={},
                einfo=None,
            )

        assert any("celery task retry" in msg for msg in cm.output)
        assert any(_always_failing_task.name in msg for msg in cm.output)

    def test_failing_task_apply_creates_dlq_row(self):
        # .apply() runs synchronously and exercises the full task lifecycle
        # (autoretry_for -> on_failure -> DLQ) without touching the result
        # backend.
        result = _always_failing_task.apply(args=("payload",))
        assert result.failed()

        dlq = DeadLetterTask.objects.get(task_name=_always_failing_task.name)
        assert dlq.exception_class == "ValueError"
        assert dlq.args == ["payload"]

    def test_on_retry_increments_task_retried(self):
        with patch("fxsharing.shares.metrics.task_retried") as counter:
            _always_failing_task.on_retry(
                exc=ValueError("boom"),
                task_id="task-xyz",
                args=("hi",),
                kwargs={},
                einfo=None,
            )
        counter.add.assert_called_once_with(
            1, {"task": _always_failing_task.name, "exception_class": "ValueError"}
        )

    def test_on_failure_increments_task_deadlettered(self):
        einfo = MagicMock()
        einfo.traceback = "ValueError: boom"
        with patch("fxsharing.shares.metrics.task_deadlettered") as counter:
            _always_failing_task.on_failure(
                exc=ValueError("boom"),
                task_id="task-xyz",
                args=("hi",),
                kwargs={},
                einfo=einfo,
            )
        counter.add.assert_called_once_with(
            1, {"task": _always_failing_task.name, "exception_class": "ValueError"}
        )


@override_settings(DEBUG=True)
class TestSeedCommand(TestCase):
    @staticmethod
    def _run():
        out = StringIO()
        call_command("seed", stdout=out)
        return out.getvalue()

    def test_creates_expected_users(self):
        self._run()
        seed_users = User.all_objects.filter(fxa_id__startswith="seed-")
        assert seed_users.count() == 5
        assert User.all_objects.get(fxa_id="seed-bob").is_banned
        assert User.all_objects.get(fxa_id="seed-admin").is_superuser
        # Carol is a soft-deleted user.
        assert User.all_objects.get(fxa_id="seed-carol").deleted_at is not None

    def test_creates_max_link_share(self):
        self._run()
        share = Share.all_objects.get(title="Max links collection")
        assert Link.all_objects.filter(share=share).count() == 30

    def test_creates_soft_deleted_share(self):
        self._run()
        deleted = Share.all_objects.get(title="Deleted draft")
        assert deleted.deleted_at is not None
        # The default manager hides soft-deleted shares.
        assert not Share.objects.filter(title="Deleted draft").exists()

    def test_creates_nested_shares(self):
        self._run()
        parent = Share.all_objects.get(title="Nested research")
        assert parent.nested_shares.count() == 2

    def test_links_have_varied_safety_status(self):
        self._run()
        statuses = set(
            Link.all_objects.values_list("safety_status", flat=True).distinct()
        )
        assert SafetyStatus.SAFE in statuses
        assert SafetyStatus.UNSAFE in statuses
        assert SafetyStatus.UNKNOWN in statuses

    def test_is_idempotent(self):
        self._run()
        first = User.all_objects.filter(fxa_id__startswith="seed-").count()
        self._run()
        second = User.all_objects.filter(fxa_id__startswith="seed-").count()
        assert first == second == 5
        # Re-running must not duplicate shares.
        assert Share.all_objects.filter(title="Max links collection").count() == 1

    def test_prints_user_login_summary(self):
        output = self._run()
        for fxa_id in (
            "seed-admin",
            "seed-alice",
            "seed-bob",
            "seed-carol",
            "seed-dave",
        ):
            assert fxa_id in output
        assert "/dev-login" in output

    def test_refuses_without_debug(self):
        with override_settings(DEBUG=False):
            with self.assertRaises(CommandError):
                call_command("seed", stdout=StringIO())


@override_settings(DEBUG=True)
class TestDevLoginView(TestCase):
    @classmethod
    def setUpClass(cls):
        # super().setUpClass() enables the DEBUG=True override; reload the URL
        # modules afterwards so the conditional /dev-login route is registered.
        super().setUpClass()
        from fxsharing import urls as project_urls
        from fxsharing.shares import urls as shares_urls

        importlib.reload(shares_urls)
        importlib.reload(project_urls)
        clear_url_caches()

    @classmethod
    def tearDownClass(cls):
        from fxsharing import urls as project_urls
        from fxsharing.shares import urls as shares_urls

        # Disable the override first, then reload so module-level urlpatterns
        # reflect DEBUG=False again for other tests.
        super().tearDownClass()
        importlib.reload(shares_urls)
        importlib.reload(project_urls)
        clear_url_caches()

    def setUp(self):
        self.user = User.objects.create_user(fxa_id="seed-devlogin")

    def test_get_lists_users(self):
        resp = self.client.get("/dev-login")
        assert resp.status_code == 200
        self.assertContains(resp, "seed-devlogin")

    def test_post_logs_in_and_sets_cookie(self):
        resp = self.client.post("/dev-login", {"user_id": str(self.user.id)})
        assert resp.status_code == 302
        assert resp.wsgi_request.user.is_authenticated
        assert resp.wsgi_request.user.fxa_id == "seed-devlogin"
        assert resp.cookies.get("auth")

    def test_logout(self):
        self.client.post("/dev-login", {"user_id": str(self.user.id)})
        resp = self.client.post("/dev-login", {"action": "logout"})
        assert resp.status_code == 302
        assert not resp.wsgi_request.user.is_authenticated

    def test_unknown_user_404s(self):
        resp = self.client.post(
            "/dev-login", {"user_id": "00000000-0000-0000-0000-000000000000"}
        )
        assert resp.status_code == 404


class TestDevLoginDisabled(TestCase):
    def test_raises_404_when_not_debug(self):
        request = RequestFactory().get("/dev-login")
        with override_settings(DEBUG=False):
            with self.assertRaises(Http404):
                dev_login(request)


class TestErrorPages(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def _request(self):
        request = self.factory.get("/")
        request.user = AnonymousUser()
        return request

    def test_404_returns_404_status(self):
        response = page_not_found(self._request(), exception=None)
        assert response.status_code == 404

    def test_404_contains_expected_copy(self):
        response = page_not_found(self._request(), exception=None)
        assert b"can't find that page" in response.content

    def test_500_returns_500_status(self):
        response = server_error(self._request())
        assert response.status_code == 500

    def test_500_contains_expected_copy(self):
        response = server_error(self._request())
        assert b"problem with this page" in response.content


@override_settings(CINDER_WEBHOOK_TOKEN="test-webhook-token")  # noqa: S106
class TestTsWebhook(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6webhook")
        cls.share = Share.objects.create(title="Sample", user=cls.user)
        cls.link = Link.objects.create(share=cls.share, url="https://example.com")

    def _signed_post(self, payload):
        body = json.dumps(payload).encode("utf-8")
        sig = hmac.new(
            settings.CINDER_WEBHOOK_TOKEN.encode("utf-8"),
            msg=body,
            digestmod=hashlib.sha256,
        ).hexdigest()
        return self.client.post(
            reverse("ts_webhook"),
            data=body,
            content_type="application/json",
            HTTP_X_CINDER_SIGNATURE=sig,
        )

    def _decision_payload(self, link, enforcement_actions, policy_ids=None):
        payload = {
            "event": "decision.created",
            "payload": {
                "enforcement_actions": enforcement_actions,
                "entity": {
                    "entity_schema": "fxsharing_url",
                    "attributes": {
                        "id": str(link.id),
                        "url": link.url,
                        "title": link.title,
                    },
                },
            },
        }
        if policy_ids:
            payload["payload"]["policies"] = [{"id": pid} for pid in policy_ids]
        return payload

    def _share_decision_payload(self, share, enforcement_actions, policy_ids=None):
        payload = {
            "event": "decision.created",
            "payload": {
                "enforcement_actions": enforcement_actions,
                "entity": {
                    "entity_schema": "fxsharing",
                    "attributes": {
                        "id": str(share.id),
                        "shortcode": share.shortcode,
                        "title": share.title,
                    },
                },
            },
        }
        if policy_ids:
            payload["payload"]["policies"] = [{"id": pid} for pid in policy_ids]
        return payload

    def test_rejects_invalid_signature(self):
        payload = self._decision_payload(self.link, ["link-collections-high-risk-url"])
        response = self.client.post(
            reverse("ts_webhook"),
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_CINDER_SIGNATURE="not-a-real-signature",
        )
        assert response.status_code == 400
        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.ACTIVE

    def test_high_risk_url_blocks_share(self):
        payload = self._decision_payload(self.link, ["link-collections-high-risk-url"])
        response = self._signed_post(payload)
        assert response.status_code == 201
        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED

    def test_high_risk_url_in_nested_share_blocks_entire_lineage(self):
        nested = Share.objects.create(
            title="Nested", user=self.user, parent_share=self.share
        )
        nested_link = Link.objects.create(share=nested, url="https://bad.example/x")

        payload = self._decision_payload(
            nested_link, ["link-collections-high-risk-url"]
        )
        response = self._signed_post(payload)
        assert response.status_code == 201

        self.share.refresh_from_db()
        nested.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED
        assert nested.status == ShareStatus.BLOCKED

    def test_approve_decision_does_not_block_share(self):
        payload = self._decision_payload(self.link, [])
        response = self._signed_post(payload)
        assert response.status_code == 201
        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.ACTIVE

    def test_unknown_link_id_returns_200(self):
        payload = self._decision_payload(self.link, ["link-collections-high-risk-url"])
        payload["payload"]["entity"]["attributes"]["id"] = (
            "00000000-0000-0000-0000-000000000000"
        )
        response = self._signed_post(payload)
        assert response.status_code == 200
        assert response.json()["fxsharing"]["handled"] is False
        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.ACTIVE

    def test_unexpected_entity_schema_returns_200(self):
        payload = self._decision_payload(self.link, ["link-collections-high-risk-url"])
        payload["payload"]["entity"]["entity_schema"] = "something_else"
        response = self._signed_post(payload)
        assert response.status_code == 200
        assert response.json()["fxsharing"]["handled"] is False
        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.ACTIVE

    def test_sibling_share_unaffected(self):
        other_user = User.objects.create_user(fxa_id="a1b2c3d4e5f6sibling")
        sibling_share = Share.objects.create(title="Sibling", user=other_user)
        Link.objects.create(share=sibling_share, url="https://sibling.example")

        payload = self._decision_payload(self.link, ["link-collections-high-risk-url"])
        response = self._signed_post(payload)
        assert response.status_code == 201

        self.share.refresh_from_db()
        sibling_share.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED
        assert sibling_share.status == ShareStatus.ACTIVE

    def test_malformed_decision_payload_returns_400(self):
        # Missing required `enforcement_actions` — schema rejects.
        payload = {
            "event": "decision.created",
            "payload": {
                "entity": {
                    "entity_schema": "fxsharing_url",
                    "attributes": {"id": str(self.link.id)},
                },
            },
        }
        response = self._signed_post(payload)
        assert response.status_code == 400
        assert response.json()["fxsharing"]["handled"] is False
        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.ACTIVE

    # ----- Badness counter on the fxsharing_url branch -----

    def test_high_risk_url_records_strike_badness(self):
        from fxsharing.shares.cinder_policies import BADNESS_STRIKE

        payload = self._decision_payload(self.link, ["link-collections-high-risk-url"])
        response = self._signed_post(payload)
        assert response.status_code == 201

        self.user.refresh_from_db()
        assert self.user.badness_counter == BADNESS_STRIKE
        assert self.user.is_banned is False

    def test_high_risk_url_with_csam_policy_bans_user_and_blocks_all_shares(self):
        from fxsharing.shares.cinder_policies import (
            BADNESS_BAN,
            POLICY_MINOR_EXPLOITATION_ID,
        )

        # A second share owned by the same user that the cascade should sweep.
        other_share = Share.objects.create(title="Other", user=self.user)

        payload = self._decision_payload(
            self.link,
            ["link-collections-high-risk-url"],
            policy_ids=[POLICY_MINOR_EXPLOITATION_ID],
        )
        with patch("fxsharing.shares.views.purge_cdn_cache") as mock_purge:
            response = self._signed_post(payload)
        assert response.status_code == 201

        self.user.refresh_from_db()
        assert self.user.badness_counter == BADNESS_BAN
        assert self.user.is_banned is True

        self.share.refresh_from_db()
        other_share.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED
        assert other_share.status == ShareStatus.BLOCKED

        purged = {
            shortcode
            for call in mock_purge.delay_on_commit.call_args_list
            for shortcode in call.args[0]
        }
        assert purged == {self.share.shortcode, other_share.shortcode}

    def test_repeated_strikes_eventually_ban_user(self):
        # Three separate links, three separate strikes — third one trips the
        # threshold and the cascade blocks even unrelated shares.
        other_share = Share.objects.create(title="Other", user=self.user)
        link2 = Link.objects.create(share=self.share, url="https://b.example")
        link3 = Link.objects.create(share=self.share, url="https://c.example")

        for link in (self.link, link2, link3):
            payload = self._decision_payload(link, ["link-collections-high-risk-url"])
            response = self._signed_post(payload)
            assert response.status_code == 201

        self.user.refresh_from_db()
        assert self.user.badness_counter == 3
        assert self.user.is_banned is True
        other_share.refresh_from_db()
        assert other_share.status == ShareStatus.BLOCKED

    # ----- fxsharing entity branch (share-report decisions) -----

    def test_share_publish_decision_returns_under_review_to_active(self):
        self.share.status = ShareStatus.UNDER_REVIEW
        self.share.save(update_fields=["status"])

        payload = self._share_decision_payload(
            self.share, ["link-collections-publish-collection"]
        )
        response = self._signed_post(payload)
        assert response.status_code == 201

        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.ACTIVE

    def test_share_publish_decision_does_not_unblock_blocked_share(self):
        # A high-risk link decision could have moved the share to BLOCKED
        # while the report review was pending; publish must not override it.
        self.share.status = ShareStatus.BLOCKED
        self.share.save(update_fields=["status"])

        payload = self._share_decision_payload(
            self.share, ["link-collections-publish-collection"]
        )
        response = self._signed_post(payload)
        assert response.status_code == 201

        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED

    def test_share_dont_publish_blocks_lineage_and_records_badness(self):
        from fxsharing.shares.cinder_policies import (
            BADNESS_STRIKE,
            POLICY_SPAM_ID,
        )

        nested = Share.objects.create(
            title="Nested", user=self.user, parent_share=self.share
        )

        payload = self._share_decision_payload(
            nested,
            ["link-collections-dont-publish-collection"],
            policy_ids=[POLICY_SPAM_ID],
        )
        with patch("fxsharing.shares.views.purge_cdn_cache") as mock_purge:
            response = self._signed_post(payload)
        assert response.status_code == 201

        self.share.refresh_from_db()
        nested.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED
        assert nested.status == ShareStatus.BLOCKED

        self.user.refresh_from_db()
        assert self.user.badness_counter == BADNESS_STRIKE

        mock_purge.delay_on_commit.assert_called_once()
        assert sorted(mock_purge.delay_on_commit.call_args.args[0]) == sorted(
            [self.share.shortcode, nested.shortcode]
        )

    def test_share_dont_publish_with_unmapped_policy_blocks_but_no_badness(self):
        # An unknown policy UUID should still block the lineage but should
        # not push badness — the dont-publish action alone is enough to
        # take down the share even when we can't weight the policy.
        payload = self._share_decision_payload(
            self.share,
            ["link-collections-dont-publish-collection"],
            policy_ids=["00000000-0000-0000-0000-000000000000"],
        )
        response = self._signed_post(payload)
        assert response.status_code == 201

        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED

        self.user.refresh_from_db()
        assert self.user.badness_counter == 0
        assert self.user.is_banned is False

    def test_share_dont_publish_with_multiple_policies_uses_max_delta(self):
        # When Cinder cites both a STRIKE-weighted policy and a BAN-weighted
        # policy on the same decision we take max(deltas), not the sum, so
        # one decision can't accidentally double-count.
        from fxsharing.shares.cinder_policies import (
            BADNESS_BAN,
            POLICY_MINOR_EXPLOITATION_ID,
            POLICY_SPAM_ID,
        )

        payload = self._share_decision_payload(
            self.share,
            ["link-collections-dont-publish-collection"],
            policy_ids=[POLICY_SPAM_ID, POLICY_MINOR_EXPLOITATION_ID],
        )
        response = self._signed_post(payload)
        assert response.status_code == 201

        self.user.refresh_from_db()
        assert self.user.badness_counter == BADNESS_BAN
        assert self.user.is_banned is True

    def test_share_decision_unknown_share_id_returns_200(self):
        payload = self._share_decision_payload(
            self.share, ["link-collections-publish-collection"]
        )
        payload["payload"]["entity"]["attributes"]["id"] = (
            "00000000-0000-0000-0000-000000000000"
        )
        response = self._signed_post(payload)
        assert response.status_code == 200
        assert response.json()["fxsharing"]["handled"] is False

    def test_high_risk_url_block_purges_cdn_cache(self):
        payload = self._decision_payload(self.link, ["link-collections-high-risk-url"])
        with patch("fxsharing.shares.views.purge_cdn_cache") as mock_purge:
            response = self._signed_post(payload)
        assert response.status_code == 201
        mock_purge.delay_on_commit.assert_called_once_with([self.share.shortcode])


@override_settings(
    CINDER_URL="https://cinder.example.test",
    CINDER_API_TOKEN="t",  # noqa: S106
    CINDER_API_ENDPOINT="https://cinder.example.test/api/v2/workflows/event/",
)
class TestSubmitLinkToCinder(TestCase):
    """Task-level coverage: the Celery task that POSTs one URL to Cinder."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6task")

    def test_payload_validates_against_schema(self):
        from unittest.mock import patch

        from jsonschema import validate

        from fxsharing.shares.cinder_schema import workflow_event_schema
        from fxsharing.shares.tasks import submit_link_to_cinder

        share = Share.objects.create(title="t", user=self.user, type="tabs")
        link = Link.objects.create(share=share, url="https://a.example", title="A")

        with patch("fxsharing.shares.tasks.requests.post") as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.raise_for_status = lambda: None
            submit_link_to_cinder(str(link.id))

        assert mock_post.call_count == 1
        payload = mock_post.call_args.kwargs["json"]
        # Raises if the task's constructed payload drifts from the schema.
        validate(payload, workflow_event_schema)
        assert payload["entity"]["attributes"]["id"] == str(link.id)
        assert payload["entity"]["attributes"]["url"] == link.url

    def test_no_call_when_cinder_url_unset(self):
        from unittest.mock import patch

        from fxsharing.shares.tasks import submit_link_to_cinder

        share = Share.objects.create(title="t", user=self.user, type="tabs")
        link = Link.objects.create(share=share, url="https://a.example")

        with override_settings(CINDER_URL=""):
            with patch("fxsharing.shares.tasks.requests.post") as mock_post:
                submit_link_to_cinder(str(link.id))
        assert mock_post.call_count == 0

    def test_unknown_link_id_is_noop(self):
        from unittest.mock import patch

        from fxsharing.shares.tasks import submit_link_to_cinder

        with patch("fxsharing.shares.tasks.requests.post") as mock_post:
            submit_link_to_cinder("00000000-0000-0000-0000-000000000000")
        assert mock_post.call_count == 0

    def test_rate_limit_applied_from_settings(self):
        from fxsharing.shares.tasks import submit_link_to_cinder

        # Celery copies the matching task_annotations onto the task at app
        # finalize-time, so the live task carries the value from settings.
        assert submit_link_to_cinder.rate_limit == settings.CINDER_TASK_RATE_LIMIT


@override_settings(
    CINDER_URL="https://cinder.example.test",
    CINDER_API_TOKEN="t",  # noqa: S106
    CINDER_API_ENDPOINT="https://cinder.example.test/api/v2/workflows/event/",
)
class TestSubmitShareToCinder(TestCase):
    """Task-level coverage: the Celery task that POSTs a reported share."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6shtask")

    def test_payload_validates_against_schema(self):
        from jsonschema import validate

        from fxsharing.shares.cinder_schema import share_report_event_schema
        from fxsharing.shares.tasks import submit_share_to_cinder

        share = Share.objects.create(title="t", user=self.user, type="tabs")

        with patch("fxsharing.shares.tasks.requests.post") as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.raise_for_status = lambda: None
            submit_share_to_cinder(str(share.id), "spam")

        assert mock_post.call_count == 1
        payload = mock_post.call_args.kwargs["json"]
        # Raises if the task's constructed payload drifts from the schema.
        validate(payload, share_report_event_schema)
        assert payload["entity"]["attributes"]["id"] == str(share.id)
        assert payload["entity"]["attributes"]["shortcode"] == share.shortcode
        assert "spam" in payload["entity"]["attributes"]["reason"]

    def test_no_call_when_cinder_url_unset(self):
        from fxsharing.shares.tasks import submit_share_to_cinder

        share = Share.objects.create(title="t", user=self.user, type="tabs")

        with override_settings(CINDER_URL=""):
            with patch("fxsharing.shares.tasks.requests.post") as mock_post:
                submit_share_to_cinder(str(share.id), "spam")
        assert mock_post.call_count == 0

    def test_unknown_share_id_is_noop(self):
        from fxsharing.shares.tasks import submit_share_to_cinder

        with patch("fxsharing.shares.tasks.requests.post") as mock_post:
            submit_share_to_cinder("00000000-0000-0000-0000-000000000000", "spam")
        assert mock_post.call_count == 0


class TestProcessNewShare(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6dispatch")

    def test_dispatches_single_group_covering_every_link_including_nested(self):
        from fxsharing.shares import tasks

        share = Share.objects.create(title="top", user=self.user, type="tabs")
        Link.objects.create(share=share, url="https://a.example")
        nested = Share.objects.create(
            title="nested", user=self.user, type="bookmarks", parent_share=share
        )
        Link.objects.create(share=nested, url="https://b.example")

        with (
            patch.object(tasks, "fetch_link_preview", autospec=True),
            patch.object(tasks, "group", autospec=True) as mock_group,
            patch.object(tasks, "_cinder_signatures", autospec=True, return_value=[]),
        ):
            tasks.process_new_share(str(share.id))

            enqueued = {
                call.args[0] for call in tasks.fetch_link_preview.s.call_args_list
            }
            mock_group.assert_called_once()
            mock_group.return_value.apply_async.assert_called_once_with()

        expected = {str(link.id) for link in Link.objects.all()}
        assert enqueued == expected

    def test_includes_cinder_signatures_in_the_group(self):
        from fxsharing.shares import tasks

        share = Share.objects.create(title="top", user=self.user, type="tabs")
        Link.objects.create(share=share, url="https://a.example")

        with (
            patch.object(tasks, "fetch_link_preview", autospec=True),
            patch.object(tasks, "group", autospec=True) as mock_group,
            patch.object(
                tasks, "_cinder_signatures", autospec=True, return_value=["cinder-sig"]
            ) as mock_cinder,
        ):
            tasks.process_new_share(str(share.id))

            link_ids = [str(link.id) for link in share.links.all()]
            mock_cinder.assert_called_once_with(link_ids)
            (signatures,) = mock_group.call_args.args
            assert "cinder-sig" in signatures

    def test_no_links_dispatches_nothing(self):
        from fxsharing.shares import tasks

        share = Share.objects.create(title="empty", user=self.user, type="tabs")

        with (
            patch.object(tasks, "fetch_link_preview", autospec=True),
            patch.object(tasks, "group", autospec=True) as mock_group,
            patch.object(tasks, "_cinder_signatures", autospec=True) as mock_cinder,
        ):
            tasks.process_new_share(str(share.id))
            assert mock_group.call_count == 0
            assert mock_cinder.call_count == 0

    def test_missing_share_is_a_noop(self):
        from fxsharing.shares import tasks

        with (
            patch.object(tasks, "fetch_link_preview", autospec=True),
            patch.object(tasks, "group", autospec=True) as mock_group,
        ):
            tasks.process_new_share("00000000-0000-0000-0000-000000000000")
            assert tasks.fetch_link_preview.s.call_count == 0
            assert mock_group.call_count == 0


@override_settings(
    CINDER_URL="https://cinder.example.test",
    CINDER_API_TOKEN="t",  # noqa: S106
    CINDER_API_ENDPOINT="https://cinder.example.test/api/v2/workflows/event/",
)
class TestCinderSignatures(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="a1b2c3d4e5f6group")

    def test_one_signature_per_link(self):
        from fxsharing.shares import tasks

        share = Share.objects.create(title="t", user=self.user, type="tabs")
        Link.objects.create(share=share, url="https://a.example")
        Link.objects.create(share=share, url="https://b.example")
        link_ids = [str(link.id) for link in share.links.all()]

        with patch.object(tasks, "submit_link_to_cinder", autospec=True):
            tasks._cinder_signatures(link_ids)
            called_with = {
                call.args[0] for call in tasks.submit_link_to_cinder.s.call_args_list
            }
        assert called_with == set(link_ids)

    def test_empty_when_cinder_url_unset(self):
        from fxsharing.shares import tasks

        with (
            override_settings(CINDER_URL=""),
            patch.object(tasks, "submit_link_to_cinder", autospec=True),
        ):
            assert tasks._cinder_signatures(["00000000-0000-0000-0000-000000000000"]) == []
            assert tasks.submit_link_to_cinder.s.call_count == 0


def _fake_getaddrinfo(host_to_ip):
    """Build a socket.getaddrinfo replacement mapping hostname -> IP string.

    Returns getaddrinfo-shaped tuples (family, type, proto, canonname,
    sockaddr) so url_safety reads the IP from ``info[4][0]``. Raises
    ``socket.gaierror`` for unknown hosts, like real resolution would.
    """

    def _resolver(host, port, *args, **kwargs):
        if host not in host_to_ip:
            raise socket.gaierror(f"unknown host {host!r}")
        ip = host_to_ip[host]
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        return [(family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (ip, port or 0))]

    return _resolver


class TestURLSafetyClassifier(SimpleTestCase):
    """Unit tests for the IP/scheme classification, no network or DB."""

    def test_public_ips_allowed(self):
        for ip in ("8.8.8.8", "1.1.1.1", "93.184.216.34"):
            assert _ip_is_public(ip) is True, ip

    def test_internal_ips_blocked(self):
        # loopback, RFC1918, link-local/metadata, CGNAT, unspecified, IPv6 loopback
        for ip in (
            "127.0.0.1",
            "10.0.0.5",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",  # noqa: S104
            "::1",
        ):
            assert _ip_is_public(ip) is False, ip

    def test_ipv4_mapped_ipv6_is_unwrapped(self):
        # ::ffff:169.254.169.254 must be judged by its embedded IPv4 address
        assert _ip_is_public("::ffff:169.254.169.254") is False

    def test_disallowed_schemes_rejected(self):
        for url in ("file:///etc/passwd", "gopher://x/", "ftp://host/f"):
            with self.assertRaises(UnsafeURLError):
                _resolve_and_validate(url)

    def test_url_without_host_rejected(self):
        with self.assertRaises(UnsafeURLError):
            _resolve_and_validate("http:///nohost")

    def test_dns_failure_rejected(self):
        with patch(
            "fxsharing.shares.url_safety.socket.getaddrinfo",
            side_effect=socket.gaierror("nope"),
        ):
            with self.assertRaises(UnsafeURLError):
                _resolve_and_validate("https://does-not-resolve.example")

    def test_host_resolving_to_internal_rejected(self):
        with patch(
            "fxsharing.shares.url_safety.socket.getaddrinfo",
            _fake_getaddrinfo({"evil.example": "169.254.169.254"}),
        ):
            with self.assertRaises(UnsafeURLError):
                _resolve_and_validate("https://evil.example/latest/meta-data/")


class TestSafeGet(SimpleTestCase):
    """Unit tests for safe_get's request + redirect-revalidation behaviour."""

    def _response(self, *, is_redirect, location=None):
        resp = MagicMock()
        resp.is_redirect = is_redirect
        resp.headers = {"Location": location} if location else {}
        return resp

    def test_allows_public_host_and_disables_auto_redirects(self):
        with (
            patch(
                "fxsharing.shares.url_safety.socket.getaddrinfo",
                _fake_getaddrinfo({"good.example": "93.184.216.34"}),
            ),
            patch(
                "fxsharing.shares.url_safety.requests.get",
                return_value=self._response(is_redirect=False),
            ) as mock_get,
        ):
            resp = safe_get("https://good.example/page", timeout=5)

        assert resp.is_redirect is False
        # We must follow redirects manually so every hop is re-validated.
        _, kwargs = mock_get.call_args
        assert kwargs["allow_redirects"] is False

    def test_redirect_to_internal_host_is_blocked(self):
        # good.example (public) 302-redirects to the cloud metadata host;
        # the second hop must be re-validated and rejected.
        mock_get = MagicMock(
            return_value=self._response(
                is_redirect=True, location="http://metadata.evil/latest/"
            )
        )
        with (
            patch(
                "fxsharing.shares.url_safety.socket.getaddrinfo",
                _fake_getaddrinfo(
                    {
                        "good.example": "93.184.216.34",
                        "metadata.evil": "169.254.169.254",
                    }
                ),
            ),
            patch("fxsharing.shares.url_safety.requests.get", mock_get),
        ):
            with self.assertRaises(UnsafeURLError):
                safe_get("https://good.example/redirect")

    def test_too_many_redirects(self):
        # A public host that redirects forever should hit the cap, not loop.
        mock_get = MagicMock(
            return_value=self._response(
                is_redirect=True, location="https://loop.example/next"
            )
        )
        with (
            patch(
                "fxsharing.shares.url_safety.socket.getaddrinfo",
                _fake_getaddrinfo({"loop.example": "93.184.216.34"}),
            ),
            patch("fxsharing.shares.url_safety.requests.get", mock_get),
        ):
            with self.assertRaises(requests.exceptions.TooManyRedirects):
                safe_get("https://loop.example/start", max_redirects=3)
        assert mock_get.call_count == 4  # initial + 3 redirects


class TestFetchLinkPreviewSSRF(TestCase):
    """fetch_link_preview must refuse SSRF targets without retrying."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(fxa_id="ssrf-fetch-preview")

    def test_internal_url_marked_unsafe_and_not_fetched(self):
        share = Share.objects.create(title="Test", user=self.user)
        link = Link.objects.create(share=share, url="https://evil.example/")

        with (
            patch(
                "fxsharing.shares.url_safety.socket.getaddrinfo",
                _fake_getaddrinfo({"evil.example": "169.254.169.254"}),
            ),
            patch("fxsharing.shares.url_safety.requests.get") as mock_get,
        ):
            fetch_link_preview(link.id)

        # No HTTP request should ever have been issued to the internal target.
        mock_get.assert_not_called()
        link.refresh_from_db()
        assert link.safety_status == SafetyStatus.UNSAFE
        assert link.preview_title == ""


class TestPurgeCdnCache(TestCase):
    @override_settings(FASTLY_PURGE_ENABLED=False)
    def test_noop_when_disabled(self):
        with patch("fxsharing.shares.tasks.requests.post") as mock_post:
            purge_cdn_cache.run(["abc123"])
        mock_post.assert_not_called()

    @override_settings(
        FASTLY_PURGE_ENABLED=True, FASTLY_API_TOKEN="", FASTLY_SERVICE_ID=""
    )
    def test_noop_when_credentials_missing(self):
        with patch("fxsharing.shares.tasks.requests.post") as mock_post:
            purge_cdn_cache.run(["abc123"])
        mock_post.assert_not_called()

    @override_settings(
        FASTLY_PURGE_ENABLED=True,
        FASTLY_API_TOKEN="secret-token",  # noqa: S106
        FASTLY_SERVICE_ID="svc123",
        FASTLY_API_URL="https://api.fastly.com",
    )
    def test_posts_purge_per_shortcode(self):
        with patch("fxsharing.shares.tasks.requests.post") as mock_post:
            purge_cdn_cache.run(["abc123", "def456"])

        assert mock_post.call_count == 2
        urls = [call.args[0] for call in mock_post.call_args_list]
        assert "https://api.fastly.com/service/svc123/purge/abc123" in urls
        assert "https://api.fastly.com/service/svc123/purge/def456" in urls
        assert mock_post.call_args_list[0].kwargs["headers"]["Fastly-Key"] == (
            "secret-token"
        )
        mock_post.return_value.raise_for_status.assert_called()

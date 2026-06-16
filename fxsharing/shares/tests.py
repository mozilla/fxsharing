import hashlib
import hmac
import importlib
import json
from datetime import timedelta
from io import StringIO
from unittest.mock import MagicMock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.contrib.messages import get_messages
from django.core.management import call_command
from django.core.management.base import CommandError
from django.http import Http404, HttpResponse
from django.test import RequestFactory, TestCase, override_settings
from django.urls import clear_url_caches, reverse
from django.utils import timezone

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
from fxsharing.shares.tasks import BaseTaskWithRetry
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

    def test_non_firefox_ua_shows_download_banner(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(
            reverse("view_share", args=[share.shortcode]),
            HTTP_USER_AGENT="Chrome/109.0",
        )
        assert response.context["is_firefox"] is False
        assert b"Created with Firefox" in response.content

    def test_firefox_ua_hides_download_banner(self):
        share = Share.objects.create(title="Test Share", user=self.user)
        response = self.client.get(
            reverse("view_share", args=[share.shortcode]),
            HTTP_USER_AGENT="Mozilla/5.0 Gecko/20100101 Firefox/109.0",
        )
        assert response.context["is_firefox"] is True
        assert b"Created with Firefox" not in response.content


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

    def test_non_firefox_ua_shows_cta(self):
        response = self.client.get(
            reverse("landing"),
            HTTP_USER_AGENT="Chrome/109.0",
        )
        assert response.context["is_firefox"] is False

    def test_firefox_ua_hides_cta(self):
        response = self.client.get(
            reverse("landing"),
            HTTP_USER_AGENT="Mozilla/5.0 Gecko/20100101 Firefox/109.0",
        )
        assert response.context["is_firefox"] is True

    def test_firefox_ios_ua_hides_cta(self):
        response = self.client.get(
            reverse("landing"),
            HTTP_USER_AGENT="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/136.0 Mobile/15E148 Safari/604.1",
        )
        assert response.context["is_firefox"] is True

    def test_missing_ua_shows_cta(self):
        response = self.client.get(reverse("landing"))
        assert response.context["is_firefox"] is False


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

    def _decision_payload(self, share, enforcement_actions):
        return {
            "event": "decision.created",
            "payload": {
                "enforcement_actions": enforcement_actions,
                "entity": {
                    "entity_schema": "fxsharing",
                    "attributes": {
                        "id": str(share.id),
                        "shortcode": share.shortcode,
                        "title": share.title,
                        "reason": "test",
                    },
                },
            },
        }

    def test_rejects_invalid_signature(self):
        payload = self._decision_payload(
            self.share, ["link-collections-dont-publish-collection"]
        )
        response = self.client.post(
            reverse("ts_webhook"),
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_CINDER_SIGNATURE="not-a-real-signature",
        )
        assert response.status_code == 400
        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.ACTIVE

    def test_dont_publish_blocks_share(self):
        payload = self._decision_payload(
            self.share, ["link-collections-dont-publish-collection"]
        )
        response = self._signed_post(payload)
        assert response.status_code == 201
        self.share.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED

    def test_ban_user_blocks_all_shares_for_that_user(self):
        other_share = Share.objects.create(title="Other", user=self.user)
        bystander_user = User.objects.create_user(fxa_id="a1b2c3d4e5f6bystand")
        bystander_share = Share.objects.create(title="Bystander", user=bystander_user)

        payload = self._decision_payload(self.share, ["link-collections-ban-user"])
        response = self._signed_post(payload)
        assert response.status_code == 201

        self.share.refresh_from_db()
        other_share.refresh_from_db()
        bystander_share.refresh_from_db()
        assert self.share.status == ShareStatus.BLOCKED
        assert other_share.status == ShareStatus.BLOCKED
        assert bystander_share.status == ShareStatus.ACTIVE

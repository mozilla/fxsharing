"""Seed the local database with diverse sample data for development / QA.

Every seed user's ``fxa_id`` is prefixed with ``SEED_PREFIX`` so the command is
idempotent: each run first hard-deletes any existing seed users (cascading to
their shares and links at the DB level) and then recreates everything from
scratch. Pair this with the DEBUG-only ``/dev-login`` page to log in as any of
these users without going through real FxA OAuth.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import models, transaction
from django.utils import timezone

from fxsharing.shares.models import Link, SafetyStatus, Share, ShareStatus

User = get_user_model()

# All seeded users share this fxa_id prefix so they can be found and wiped.
SEED_PREFIX = "seed-"

# Cycle links through these safety statuses so previews/badges have variety.
_SAFETY_CYCLE = [
    SafetyStatus.SAFE,
    SafetyStatus.UNKNOWN,
    SafetyStatus.UNSAFE,
]

MAX_LINKS = 30  # Mirrors the maxItems in share_schema.py.

# Order and one-line descriptions for the post-seed login summary.
USER_ORDER = ["admin", "alice", "bob", "carol", "dave"]
USER_DESCRIPTIONS = {
    "admin": "superuser — full Django admin access",
    "alice": "active user — max-link, small, nested, expired & deleted shares",
    "bob": "banned user — blocked and under-review shares",
    "carol": "soft-deleted user",
    "dave": "active user — pending and system-flagged shares",
}


class Command(BaseCommand):
    help = "Seed the local database with diverse sample data for development."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Refusing to seed: this command requires DEBUG=True.")

        with transaction.atomic():
            self._wipe_existing_seed_data()
            users = self._create_users()
            self._create_shares(users)

        self._print_user_summary(users)
        self.stdout.write(
            self.style.SUCCESS(
                "Seed complete. Log in as any of these users at /dev-login "
                "(DEBUG only)."
            )
        )

    def _print_user_summary(self, users):
        self.stdout.write("")
        self.stdout.write("Sample users you can log in as:")
        width = max(len(u.fxa_id) for u in users.values())
        for key in USER_ORDER:
            user = users[key]
            self.stdout.write(f"  {user.fxa_id:<{width}}  {USER_DESCRIPTIONS[key]}")
        self.stdout.write("")

    # -- helpers --------------------------------------------------------------

    def _wipe_existing_seed_data(self):
        """Hard-delete prior seed users, cascading to their shares and links.

        ``User.delete`` / the soft-delete queryset only set ``deleted_at``; we
        want a true delete so re-seeding starts clean. ``QuerySet.delete`` uses
        the collector, which issues real SQL DELETEs and cascades to related
        Shares/Links, bypassing the soft-delete overrides.
        """
        seed_users = User.all_objects.filter(fxa_id__startswith=SEED_PREFIX)
        deleted, _ = models.QuerySet.delete(seed_users)
        if deleted:
            self.stdout.write(f"Removed {deleted} existing seed object(s).")

    def _create_users(self):
        users = {
            "admin": User.objects.create_superuser(fxa_id=f"{SEED_PREFIX}admin"),
            "alice": User.objects.create_user(fxa_id=f"{SEED_PREFIX}alice"),
            "bob": User.objects.create_user(fxa_id=f"{SEED_PREFIX}bob", is_banned=True),
            "carol": User.objects.create_user(fxa_id=f"{SEED_PREFIX}carol"),
            "dave": User.objects.create_user(fxa_id=f"{SEED_PREFIX}dave"),
        }
        self.stdout.write(f"Created {len(users)} seed users.")
        return users

    def _create_shares(self, users):
        alice = users["alice"]
        bob = users["bob"]
        carol = users["carol"]
        dave = users["dave"]

        # Alice: a share with the maximum number of links.
        self._make_share(alice, "Max links collection", link_count=MAX_LINKS)

        # Alice: a small everyday share.
        self._make_share(alice, "A few good reads", link_count=3)

        # Alice: a nested share (parent containing child shares).
        parent = self._make_share(alice, "Nested research", link_count=2)
        self._make_share(alice, "Sub-topic: papers", link_count=4, parent=parent)
        self._make_share(alice, "Sub-topic: videos", link_count=3, parent=parent)

        # Alice: an expired share.
        self._make_share(
            alice,
            "Expired weekend picks",
            link_count=2,
            status=ShareStatus.EXPIRED,
            expires_at=timezone.now() - timedelta(days=3),
        )

        # Alice: a soft-deleted share (created, then soft-deleted).
        deleted_share = self._make_share(alice, "Deleted draft", link_count=2)
        deleted_share.delete()

        # Bob: a banned user whose content was moderated.
        self._make_share(
            bob, "Blocked content", link_count=3, status=ShareStatus.BLOCKED
        )
        self._make_share(
            bob, "Reported collection", link_count=2, status=ShareStatus.UNDER_REVIEW
        )

        # Carol: a soft-deleted user (her shares cascade to soft-deleted).
        self._make_share(carol, "Carol's bookmarks", link_count=3)
        carol.delete()

        # Dave: shares awaiting / flagged by automated review.
        self._make_share(
            dave, "Pending review", link_count=2, status=ShareStatus.PENDING
        )
        self._make_share(
            dave,
            "System-flagged links",
            link_count=2,
            status=ShareStatus.FLAGGED_BY_SYSTEM,
        )

        self.stdout.write("Created seed shares and links.")

    def _make_share(
        self,
        user,
        title,
        *,
        link_count,
        status=ShareStatus.ACTIVE,
        parent=None,
        expires_at=None,
    ):
        share = Share.objects.create(
            user=user,
            title=title,
            status=status,
            parent_share=parent,
            expires_at=expires_at,
        )
        Link.objects.bulk_create(
            [self._build_link(share, i) for i in range(link_count)]
        )
        return share

    def _build_link(self, share, index):
        safety = _SAFETY_CYCLE[index % len(_SAFETY_CYCLE)]
        slug = index + 1
        return Link(
            share=share,
            title=f"Example link {slug}",
            url=f"https://example.com/{share.shortcode}/{slug}",
            safety_status=safety,
            favicon_url="https://example.com/favicon.ico",
            preview_title=f"Example link {slug}",
            preview_description=f"A sample link ({safety}) for local development.",
            preview_image_url=f"https://example.com/{share.shortcode}/{slug}/og.png",
        )

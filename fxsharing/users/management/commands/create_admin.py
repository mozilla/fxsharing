from django.core.management.base import BaseCommand, CommandError

from fxsharing.users.models import User


class Command(BaseCommand):
    help = (
        "Pre-provision an internal admin account authenticated via Auth0/LDAP "
        "The email must match the Mozilla LDAP account; login is further "
        "gated by the fx-sharing-admin group in Auth0."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument(
            "--staff-only",
            action="store_true",
            help="Grant is_staff but not is_superuser.",
        )

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        if User.all_objects.filter(email__iexact=email).exists():
            raise CommandError(f"A user with email {email} already exists.")

        User.objects.create_admin(
            email=email,
            is_superuser=not options["staff_only"],
        )
        self.stdout.write(self.style.SUCCESS(f"Created admin {email}"))

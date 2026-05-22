from django.db import migrations
from django.utils import timezone


def deleted_status_to_deleted_at(apps, schema_editor):
    Share = apps.get_model("shares", "Share")
    Share.objects.filter(status="deleted").update(
        deleted_at=timezone.now(), status="active"
    )


def deleted_at_to_deleted_status(apps, schema_editor):
    Share = apps.get_model("shares", "Share")
    Share.objects.filter(deleted_at__isnull=False).update(
        deleted_at=None, status="deleted"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("shares", "0008_share_deleted_at_alter_share_status"),
    ]

    operations = [
        migrations.RunPython(
            deleted_status_to_deleted_at,
            reverse_code=deleted_at_to_deleted_status,
        ),
    ]

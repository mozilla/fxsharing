from django.contrib import admin

from .models import Share


@admin.register(Share)
class ShareAdmin(admin.ModelAdmin):
    list_display = (
        "shortcode",
        "title",
        "user",
        "status",
        "created_at",
        "expires_at",
        "deleted_at",
    )
    list_filter = ("status", "deleted_at")
    search_fields = ("shortcode", "title", "user__fxa_id")
    ordering = ("-created_at",)
    readonly_fields = ("id", "shortcode", "created_at", "deleted_at")

    def get_queryset(self, request):
        return Share.all_objects.all()

from django.contrib import admin

from .models import DeadLetterTask, Share


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


@admin.register(DeadLetterTask)
class DeadLetterTaskAdmin(admin.ModelAdmin):
    list_display = (
        "task_name",
        "task_id",
        "exception_class",
        "queue",
        "created_at",
    )
    list_filter = ("task_name", "exception_class", "queue")
    search_fields = ("task_name", "task_id", "exception_class", "exception_message")
    ordering = ("-created_at",)
    readonly_fields = (
        "id",
        "task_name",
        "task_id",
        "args",
        "kwargs",
        "exception_class",
        "exception_message",
        "traceback",
        "queue",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "fxa_id",
        "is_active",
        "is_banned",
        "is_staff",
        "created_at",
        "deleted_at",
    )
    list_filter = ("is_active", "is_banned", "is_staff", "deleted_at")
    search_fields = ("fxa_id",)
    ordering = ("-created_at",)
    readonly_fields = ("id", "created_at", "deleted_at")

    fieldsets = (
        (None, {"fields": ("id", "fxa_id")}),
        ("Status", {"fields": ("is_active", "is_banned", "is_staff", "is_superuser")}),
        ("Permissions", {"fields": ("groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "created_at", "deleted_at")}),
    )
    add_fieldsets = ((None, {"fields": ("fxa_id",)}),)

    # No password fields — users authenticate via FxA
    filter_horizontal = ("groups", "user_permissions")

    def get_queryset(self, request):
        return User.all_objects.all()

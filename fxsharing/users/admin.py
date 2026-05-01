from django.contrib import admin

from fxsharing.users.models import Session, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("fxa_id", "is_banned", "created_at")
    list_filter = ("is_banned",)
    search_fields = ("fxa_id",)
    readonly_fields = ("id", "created_at")


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "expires_at")
    search_fields = ("user__fxa_id", "session_token")
    readonly_fields = ("id", "session_token", "created_at")

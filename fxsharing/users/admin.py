from django.contrib import admin

from fxsharing.users.models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("fxa_id", "is_banned", "is_active", "is_staff", "created_at")
    list_filter = ("is_banned", "is_active", "is_staff")
    search_fields = ("fxa_id",)
    readonly_fields = ("id", "created_at")

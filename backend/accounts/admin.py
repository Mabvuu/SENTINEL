from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class SentinelUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Sentinel", {"fields": ("role", "phone")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Sentinel", {"fields": ("role", "phone")}),
    )
    list_display = (
        "username", "first_name", "last_name",
        "role", "is_active", "is_staff",
    )
    list_filter = UserAdmin.list_filter + ("role",)

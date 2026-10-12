from django.contrib import admin
from .models import Client, Site, Shift


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_name", "phone", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "contact_name", "email", "phone")


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = (
        "name", "client", "radius_metres",
        "required_guards", "is_active",
    )
    list_filter = ("is_active", "client")
    search_fields = ("name", "address", "client__name")
    autocomplete_fields = ("client",)
    filter_horizontal = ("supervisors",)
    list_select_related = ("client",)


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("guard", "site", "starts_at", "ends_at", "status")
    list_filter = ("status", "site")
    search_fields = (
        "guard__username", "guard__first_name",
        "guard__last_name", "site__name",
    )
    autocomplete_fields = ("guard", "site")
    list_select_related = ("guard", "site", "site__client")
    date_hierarchy = "starts_at"

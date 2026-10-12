from django.contrib import admin
from .models import Attendance


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = (
        "guard", "shift", "clocked_in_at",
        "clocked_out_at", "gps_verified_at_clock_out",
    )
    search_fields = ("guard__username", "guard__first_name", "guard__last_name")
    list_select_related = ("guard", "shift", "shift__site")
    readonly_fields = (
        "shift", "guard", "clocked_in_at", "clocked_out_at",
        "clock_in_gps", "clock_out_gps", "site_snapshot", "clock_out_note",
    )

    @admin.display(boolean=True, description="Clock-out GPS verified")
    def gps_verified_at_clock_out(self, obj):
        return obj.clock_out_gps is not None

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

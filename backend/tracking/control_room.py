from django.db.models import F
from django.utils import timezone

from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.pagination import PageNumberPagination

from .api import PrivateAPIView
from .models import Attendance


class IsControlRoom(BasePermission):
    message = "Administrator or supervisor access is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user.is_authenticated
            and user.is_active
            and (
                user.is_superuser
                or user.role in ("admin", "supervisor")
            )
        )


class ControlRoomPagination(PageNumberPagination):
    page_size = 100


class ControlRoomLocationsView(PrivateAPIView):
    permission_classes = [IsAuthenticated, IsControlRoom]

    def get(self, request):
        now = timezone.now()

        records = Attendance.objects.filter(
            clocked_out_at__isnull=True,
            shift__status="scheduled",
            shift__ends_at__gt=now,
            shift__guard_id=F("guard_id"),
            shift__site__is_active=True,
            shift__site__client__is_active=True,
            guard__is_active=True,
        )

        user = request.user

        if not user.is_superuser and user.role == "supervisor":
            records = records.filter(
                shift__site__supervisors=user
            )

        records = records.select_related(
            "guard",
            "shift",
            "shift__site",
            "shift__site__client",
            "latest_location",
        ).order_by("shift__site__name", "guard__username", "pk")

        paginator = ControlRoomPagination()
        page = paginator.paginate_queryset(records, request, view=self)
        results = []

        for attendance in page:
            location = getattr(attendance, "latest_location", None)

            status = "unavailable"
            last_position = None

            if location is not None:
                capture_age = (
                    now - location.captured_at
                ).total_seconds()
                receipt_age = (
                    now - location.received_at
                ).total_seconds()

                # An old "inside" reading is not proof of current presence.
                fresh = (
                    -5 <= capture_age <= 90
                    and 0 <= receipt_age <= 90
                )
                status = location.status if fresh else "stale"

                last_position = {
                    "latitude": location.latitude,
                    "longitude": location.longitude,
                    "accuracy_metres": location.accuracy_metres,
                    "distance_metres": location.distance_metres,
                    "captured_at": location.captured_at.isoformat(),
                    "received_at": location.received_at.isoformat(),
                    "age_seconds": max(0, round(capture_age)),
                    "status_at_capture": location.status,
                }

            site = attendance.shift.site

            results.append({
                "attendance_id": attendance.pk,
                "shift_id": attendance.shift_id,
                "guard": {
                    "id": attendance.guard_id,
                    "name": (
                        attendance.guard.get_full_name()
                        or attendance.guard.username
                    ),
                },
                "site": {
                    "id": site.pk,
                    "name": site.name,
                    "client": site.client.name,
                },
                "clocked_in_at": attendance.clocked_in_at.isoformat(),
                "shift_ends_at": attendance.shift.ends_at.isoformat(),
                "location_status": status,
                "last_position": last_position,
                "assigned_boundary": attendance.site_snapshot,
            })

        response = paginator.get_paginated_response(results)
        response.data["server_time"] = now.isoformat()
        response.data["stale_after_seconds"] = 90
        return response

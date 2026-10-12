from datetime import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from operations.models import Shift
from .api import IsGuard, PrivateAPIView
from .gps import GPSValidationError, distance_metres, number
from .models import Attendance, LatestLocation
from .services import AttendanceError, locked_guard


class LocationThrottle(UserRateThrottle):
    scope = "location_updates"
    rate = "12/min"


def parse_reading(payload, now):
    if not isinstance(payload, dict):
        raise GPSValidationError("Send a GPS object.")

    latitude = number(payload.get("latitude"), "Latitude", -90, 90)
    longitude = number(payload.get("longitude"), "Longitude", -180, 180)
    accuracy = number(
        payload.get("accuracy_metres"), "GPS accuracy", 0.01, 100000
    )

    timestamp = payload.get("captured_at")
    if not isinstance(timestamp, str):
        raise GPSValidationError("A GPS capture timestamp is required.")

    try:
        captured_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        raise GPSValidationError("Invalid GPS timestamp.")

    if timezone.is_naive(captured_at):
        raise GPSValidationError("The GPS timestamp must include a timezone.")

    age = (now - captured_at).total_seconds()
    if age < -5:
        raise GPSValidationError("Check your phone clock. GPS is in the future.")
    if age > 30:
        raise GPSValidationError("GPS reading expired. Send a fresh location.")

    return latitude, longitude, accuracy, captured_at


@transaction.atomic
def save_location(user, shift_id, payload):
    # Use the same guard lock as clock-out to serialize these operations.
    guard = locked_guard(user)

    try:
        attendance = Attendance.objects.select_for_update().get(
            guard=guard,
            shift_id=shift_id,
            clocked_out_at__isnull=True,
        )
    except Attendance.DoesNotExist:
        raise AttendanceError("Clock into your assigned shift first.")

    shift = Shift.objects.get(pk=attendance.shift_id)
    now = timezone.now()

    if (
        shift.guard_id != guard.pk
        or shift.status != Shift.Status.SCHEDULED
        or now >= shift.ends_at
        or not shift.site.is_active
        or not shift.site.client.is_active
    ):
        raise AttendanceError("Location updates are closed for this shift.")

    latitude, longitude, accuracy, captured_at = parse_reading(payload, now)

    if captured_at < attendance.clocked_in_at:
        raise GPSValidationError("Get a new GPS reading after clocking in.")

    # Keep the site boundary that was recorded at clock-in.
    site = attendance.site_snapshot
    distance = distance_metres(
        latitude,
        longitude,
        float(site["latitude"]),
        float(site["longitude"]),
    )
    radius = float(site["radius_metres"])

    if accuracy > float(site["max_accuracy_metres"]):
        status = "uncertain"
    elif distance + accuracy <= radius:
        status = "inside"
    elif distance - accuracy > radius:
        status = "outside"
    else:
        status = "uncertain"

    previous = LatestLocation.objects.filter(attendance=attendance).first()

    # Retries and older readings must not make an old position look fresh.
    if previous and captured_at <= previous.captured_at:
        return previous, False

    location, _ = LatestLocation.objects.update_or_create(
        attendance=attendance,
        defaults={
            "latitude": latitude,
            "longitude": longitude,
            "accuracy_metres": accuracy,
            "distance_metres": round(distance, 2),
            "captured_at": captured_at,
            "received_at": now,
            "status": status,
        },
    )
    return location, True


class LocationUpdateView(PrivateAPIView):
    permission_classes = [IsAuthenticated, IsGuard]
    throttle_classes = [LocationThrottle]

    def post(self, request, shift_id):
        if not isinstance(request.data, dict):
            raise ValidationError({"detail": "Send a JSON object."})

        try:
            location, updated = save_location(
                request.user,
                shift_id,
                request.data.get("gps"),
            )
        except (AttendanceError, GPSValidationError) as error:
            raise ValidationError({"detail": str(error)})

        return Response({
            "updated": updated,
            "status": location.status,
            "accuracy_metres": location.accuracy_metres,
            "distance_metres": location.distance_metres,
            "captured_at": location.captured_at.isoformat(),
            "received_at": location.received_at.isoformat(),
        })

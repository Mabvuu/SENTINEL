from datetime import timedelta
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from operations.models import Shift
from .gps import validate_position
from .models import Attendance


class AttendanceError(ValueError):
    pass


def locked_guard(user):
    if not user or not user.is_authenticated:
        raise AttendanceError("Please sign in.")

    guard = get_user_model().objects.select_for_update().get(pk=user.pk)
    if not guard.is_active or guard.role != "guard":
        raise AttendanceError("An active guard account is required.")
    return guard


@transaction.atomic
def clock_in(user, shift_id, gps):
    guard = locked_guard(user)

    try:
        shift = Shift.objects.select_for_update().get(
            pk=shift_id, guard_id=guard.pk
        )
    except Shift.DoesNotExist:
        raise AttendanceError("This shift is not assigned to you.")

    now = timezone.now()

    if shift.status != Shift.Status.SCHEDULED:
        raise AttendanceError("This shift is cancelled.")

    if not shift.site.is_active or not shift.site.client.is_active:
        raise AttendanceError("The site or client is inactive.")

    if now < shift.starts_at - timedelta(minutes=15):
        raise AttendanceError("Clock-in opens 15 minutes before your shift.")

    if now >= shift.ends_at:
        raise AttendanceError("This shift has already ended.")

    if Attendance.objects.filter(shift=shift).exists():
        raise AttendanceError("Attendance already exists for this shift.")

    if Attendance.objects.filter(
        guard=guard, clocked_out_at__isnull=True
    ).exists():
        raise AttendanceError("Clock out of your previous shift first.")

    reading = validate_position(shift.site, gps, now=now)

    snapshot = {
        "site_id": shift.site_id,
        "name": shift.site.name,
        "latitude": float(shift.site.latitude),
        "longitude": float(shift.site.longitude),
        "radius_metres": shift.site.radius_metres,
        "max_accuracy_metres": shift.site.max_accuracy_metres,
        "scheduled_start": shift.starts_at.isoformat(),
        "scheduled_end": shift.ends_at.isoformat(),
    }

    return Attendance.objects.create(
        shift=shift,
        guard=guard,
        clocked_in_at=now,
        clock_in_gps=reading,
        site_snapshot=snapshot,
    )


@transaction.atomic
def clock_out(user, shift_id, gps=None, note=""):
    guard = locked_guard(user)

    try:
        attendance = Attendance.objects.select_for_update().get(
            shift_id=shift_id, guard=guard
        )
    except Attendance.DoesNotExist:
        raise AttendanceError("You have not clocked into this shift.")

    # Retrying after a lost response returns the original record.
    if attendance.clocked_out_at:
        return attendance

    if not isinstance(note, str) or len(note) > 500:
        raise AttendanceError("The clock-out note must be 500 characters or less.")

    now = timezone.now()
    reading = None

    if gps is not None:
        site = SimpleNamespace(**attendance.site_snapshot)
        reading = validate_position(site, gps, now=now)
    elif not note.strip():
        raise AttendanceError("Explain why GPS is unavailable.")

    # A guard can end attendance if location permission or GPS is lost.
    # Missing GPS is recorded as unverified, never as on-site.
    attendance.clocked_out_at = now
    attendance.clock_out_gps = reading
    attendance.clock_out_note = note.strip()
    attendance.save(update_fields=[
        "clocked_out_at", "clock_out_gps", "clock_out_note"
    ])
    return attendance

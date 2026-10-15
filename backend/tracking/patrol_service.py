from .gps import distance_metres
from .models import PatrolPoint


def record_point(location):
    attendance = location.attendance
    if attendance.clocked_out_at or location.captured_at < attendance.clocked_in_at:
        return
    if PatrolPoint.objects.filter(attendance=attendance, captured_at=location.captured_at).exists():
        return
    previous = PatrolPoint.objects.filter(attendance=attendance).order_by('-captured_at', '-id').first()
    if previous and location.captured_at <= previous.captured_at:
        return
    limit = min(50, float(attendance.site_snapshot.get('max_accuracy_metres', 50)))
    usable = location.accuracy_metres <= limit
    anchor = usable
    start = True
    added = 0
    reason = 'first_reading' if usable else 'poor_accuracy'
    if usable and previous and previous.usable:
        reference = PatrolPoint.objects.filter(attendance=attendance, is_anchor=True).order_by('-captured_at', '-id').first()
        if reference:
            seconds = (location.captured_at - reference.captured_at).total_seconds()
            distance = distance_metres(reference.latitude, reference.longitude, location.latitude, location.longitude)
            if seconds > 120:
                reason = 'gap'
            elif seconds <= 0:
                return
            elif distance / seconds > 4:
                usable = anchor = False
                reason = 'implausible_speed'
            elif distance <= max(8, reference.accuracy_metres + location.accuracy_metres):
                anchor = False
                start = False
                reason = 'below_uncertainty'
            else:
                added = round(distance, 2)
                start = False
                reason = 'movement'
    elif usable and previous:
        reason = 'resume_after_uncertainty'
    PatrolPoint.objects.create(
        attendance=attendance, latitude=location.latitude, longitude=location.longitude,
        accuracy_metres=location.accuracy_metres, captured_at=location.captured_at,
        received_at=location.received_at, status=location.status,
        distance_added=added, usable=usable, is_anchor=anchor,
        segment_start=start, reason=reason,
    )

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Attendance(models.Model):
    shift = models.OneToOneField(
        "operations.Shift",
        on_delete=models.PROTECT,
        related_name="attendance",
    )
    guard = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="attendance_records",
    )
    clocked_in_at = models.DateTimeField()
    clocked_out_at = models.DateTimeField(null=True, blank=True)
    clock_in_gps = models.JSONField()
    clock_out_gps = models.JSONField(null=True, blank=True)
    site_snapshot = models.JSONField()
    clock_out_note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["-clocked_in_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["guard"],
                condition=Q(clocked_out_at__isnull=True),
                name="one_open_attendance_per_guard",
            ),
            models.CheckConstraint(
                condition=(
                    Q(clocked_out_at__isnull=True)
                    | Q(clocked_out_at__gte=F("clocked_in_at"))
                ),
                name="attendance_end_after_start",
            ),
        ]

    def __str__(self):
        return f"{self.guard} — shift {self.shift_id}"


class LatestLocation(models.Model):
    attendance = models.OneToOneField(
        Attendance,
        on_delete=models.CASCADE,
        related_name="latest_location",
    )
    latitude = models.FloatField()
    longitude = models.FloatField()
    accuracy_metres = models.FloatField()
    distance_metres = models.FloatField()
    captured_at = models.DateTimeField()
    received_at = models.DateTimeField()
    status = models.CharField(
        max_length=12,
        choices=[
            ("inside", "Inside"),
            ("outside", "Outside"),
            ("uncertain", "Uncertain"),
        ],
    )

    def __str__(self):
        return f"Attendance {self.attendance_id}: {self.status}"

# Sentinel patrol history v1
class PatrolPoint(models.Model):
    attendance = models.ForeignKey(Attendance, on_delete=models.CASCADE, related_name='patrol_points')
    latitude = models.FloatField()
    longitude = models.FloatField()
    accuracy_metres = models.FloatField()
    captured_at = models.DateTimeField()
    received_at = models.DateTimeField()
    status = models.CharField(max_length=12)
    distance_added = models.FloatField(default=0)
    usable = models.BooleanField(default=False)
    is_anchor = models.BooleanField(default=False)
    segment_start = models.BooleanField(default=True)
    reason = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ['captured_at', 'id']
        constraints = [models.UniqueConstraint(fields=['attendance', 'captured_at'], name='unique_patrol_capture')]
        indexes = [models.Index(fields=['attendance', 'id'], name='patrol_attendance_cursor')]

from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=LatestLocation, dispatch_uid='sentinel_patrol_history_v1')
def record_patrol_location(sender, instance, **kwargs):
    from .patrol_service import record_point
    record_point(instance)

from .round_models import PatrolRoute, ScheduledRound, CheckpointVisit

from .duty_models import ShiftReport

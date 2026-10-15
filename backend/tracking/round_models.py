from django.conf import settings
from django.db import models
from django.db.models import Q, F


class PatrolRoute(models.Model):
    site = models.ForeignKey('operations.Site', on_delete=models.PROTECT, related_name='checkpoint_routes')
    name = models.CharField(max_length=120)
    boundary = models.JSONField(default=list)
    checkpoints = models.JSONField(default=list)
    must_follow_order = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ['name', 'id']


class ScheduledRound(models.Model):
    shift = models.ForeignKey('operations.Shift', on_delete=models.PROTECT, related_name='patrol_rounds')
    route = models.ForeignKey(PatrolRoute, on_delete=models.PROTECT)
    # Freeze plan and identity so later edits never rewrite patrol evidence.
    guard = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    snapshot = models.JSONField()
    starts_at = models.DateTimeField()
    due_at = models.DateTimeField()
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    attendance = models.ForeignKey('tracking.Attendance', on_delete=models.PROTECT, null=True, blank=True)
    class Meta:
        ordering = ['-starts_at', '-id']
        constraints = [models.CheckConstraint(condition=Q(due_at__gt=F('starts_at')), name='round_deadline_after_start')]
        indexes = [models.Index(fields=['guard', 'starts_at'], name='round_guard_start')]


class CheckpointVisit(models.Model):
    patrol_round = models.ForeignKey(ScheduledRound, on_delete=models.CASCADE, related_name='visits')
    checkpoint = models.PositiveIntegerField()
    gps = models.JSONField()
    checked_at = models.DateTimeField()
    class Meta:
        ordering = ['checkpoint']
        constraints = [models.UniqueConstraint(fields=['patrol_round', 'checkpoint'], name='one_visit_per_round_checkpoint')]

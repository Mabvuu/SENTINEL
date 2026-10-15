from django.conf import settings
from django.db import models

class ShiftReport(models.Model):
    attendance = models.OneToOneField('tracking.Attendance', on_delete=models.PROTECT, related_name='duty_report')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    narrative = models.TextField()
    missed_reason = models.TextField(blank=True)
    incidents = models.TextField(blank=True)
    evidence = models.JSONField(default=dict)
    submitted_at = models.DateTimeField(auto_now_add=True)

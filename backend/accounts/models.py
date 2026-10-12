from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrator"
        SUPERVISOR = "supervisor", "Supervisor"
        GUARD = "guard", "Guard"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.GUARD,
    )
    phone = models.CharField(max_length=30, blank=True)


    employee_number = models.CharField(max_length=50, blank=True)
    national_id = models.CharField(max_length=100, blank=True)

    training_status = models.CharField(
        max_length=30,
        choices=[
            ("not_started", "Not started"),
            ("in_progress", "In progress"),
            ("completed", "Completed"),
            ("expired", "Expired"),
        ],
        default="not_started",
    )

    vetting_status = models.CharField(
        max_length=30,
        choices=[
            ("pending", "Pending"),
            ("in_progress", "In progress"),
            ("cleared", "Cleared"),
            ("rejected", "Rejected"),
        ],
        default="pending",
    )

    employment_status = models.CharField(
        max_length=30,
        choices=[
            ("active", "Active"),
            ("suspended", "Suspended"),
            ("on_leave", "On leave"),
            ("terminated", "Terminated"),
        ],
        default="active",
    )

    training_notes = models.TextField(blank=True)
    vetting_notes = models.TextField(blank=True)

    def __str__(self):
        return self.get_full_name() or self.username

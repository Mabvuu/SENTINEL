from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import F, Q


class Client(models.Model):
    name = models.CharField(max_length=200)
    contact_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Site(models.Model):
    client = models.ForeignKey(
        Client, on_delete=models.PROTECT, related_name="sites"
    )
    name = models.CharField(max_length=200)
    address = models.TextField()
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )
    radius_metres = models.PositiveIntegerField(
        default=100,
        validators=[MinValueValidator(20), MaxValueValidator(5000)],
        help_text="Allowed distance from the site centre in metres.",
    )
    max_accuracy_metres = models.PositiveIntegerField(
        default=50,
        validators=[MinValueValidator(5), MaxValueValidator(200)],
        help_text="Maximum acceptable GPS uncertainty in metres.",
    )
    required_guards = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1)]
    )
    supervisors = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="supervised_sites",
        limit_choices_to={"role": "supervisor", "is_active": True},
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["client__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["client", "name"],
                name="unique_client_site",
            ),
            models.CheckConstraint(
                condition=Q(latitude__gte=-90, latitude__lte=90),
                name="site_valid_latitude",
            ),
            models.CheckConstraint(
                condition=Q(longitude__gte=-180, longitude__lte=180),
                name="site_valid_longitude",
            ),
            models.CheckConstraint(
                condition=Q(radius_metres__gte=20, radius_metres__lte=5000),
                name="site_valid_radius",
            ),
            models.CheckConstraint(
                condition=Q(
                    max_accuracy_metres__gte=5,
                    max_accuracy_metres__lte=200,
                ),
                name="site_valid_accuracy",
            ),
            models.CheckConstraint(
                condition=Q(required_guards__gte=1),
                name="site_requires_guard",
            ),
        ]

    def __str__(self):
        return f"{self.client.name} — {self.name}"


class Shift(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        CANCELLED = "cancelled", "Cancelled"

    guard = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="shifts",
        limit_choices_to={"role": "guard", "is_active": True},
    )
    site = models.ForeignKey(
        Site, on_delete=models.PROTECT, related_name="shifts"
    )
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-starts_at"]
        indexes = [
            models.Index(fields=["guard", "starts_at"]),
            models.Index(fields=["site", "starts_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")),
                name="shift_end_after_start",
            ),
        ]

    def clean(self):
        super().clean()

        if self.starts_at and self.ends_at:
            if self.ends_at <= self.starts_at:
                raise ValidationError({
                    "ends_at": "The shift must end after it starts."
                })

        if self.status == self.Status.CANCELLED:
            return

        if self.guard_id:
            if self.guard.role != "guard" or not self.guard.is_active:
                raise ValidationError({
                    "guard": "Select an active guard account."
                })

        if self.site_id:
            if not self.site.is_active or not self.site.client.is_active:
                raise ValidationError({
                    "site": "The site and client must both be active."
                })

        if self.guard_id and self.starts_at and self.ends_at:
            overlaps = Shift.objects.filter(
                guard_id=self.guard_id,
                status=self.Status.SCHEDULED,
                starts_at__lt=self.ends_at,
                ends_at__gt=self.starts_at,
            ).exclude(pk=self.pk)

            if overlaps.exists():
                raise ValidationError(
                    "This guard already has a shift during that time."
                )

    def __str__(self):
        return f"{self.guard} — {self.site.name} — {self.starts_at}"

# Sentinel operations modules v1
class OperationsEntry(models.Model):
    KIND = [("incident", "Incident"), ("handover", "Handover"), ("inspection", "Supervisor check")]
    kind = models.CharField(max_length=20, choices=KIND)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="entries")
    title = models.CharField(max_length=200)
    notes = models.TextField()
    severity = models.CharField(max_length=10, choices=[("low", "Low"), ("medium", "Medium"), ("high", "High")], default="low")
    status = models.CharField(max_length=12, choices=[("open", "Open"), ("resolved", "Resolved")], default="open")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="resolved_entries")

    class Meta:
        ordering = ["-created_at", "-id"]


class Contract(models.Model):
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="contracts")
    reference = models.CharField(max_length=80, unique=True)
    starts_on = models.DateField()
    ends_on = models.DateField()
    monthly_fee = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [models.CheckConstraint(condition=Q(ends_on__gte=F("starts_on")), name="contract_dates_valid"), models.CheckConstraint(condition=Q(monthly_fee__gte=0), name="contract_fee_nonnegative")]


class Invoice(models.Model):
    contract = models.ForeignKey(Contract, on_delete=models.PROTECT, related_name="invoices")
    reference = models.CharField(max_length=80, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    due_on = models.DateField()
    notes = models.TextField(blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="invoice_amount_positive")]

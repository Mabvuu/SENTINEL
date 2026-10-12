from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from operations.models import Client, Site, Shift
from .gps import GPSValidationError
from .models import Attendance
from .services import AttendanceError, clock_in, clock_out


class AttendanceTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.guard = users.objects.create_user(username="guard1", role="guard")
        self.other = users.objects.create_user(username="guard2", role="guard")
        client = Client.objects.create(name="Test client")
        self.site = Site.objects.create(
            client=client,
            name="Test site",
            address="Test address",
            latitude=0,
            longitude=0,
            radius_metres=100,
            max_accuracy_metres=50,
        )
        now = timezone.now()
        self.shift = Shift.objects.create(
            guard=self.guard,
            site=self.site,
            starts_at=now - timedelta(minutes=5),
            ends_at=now + timedelta(hours=8),
        )

    def gps(self, **changes):
        return {
            "latitude": 0,
            "longitude": 0,
            "accuracy_metres": 10,
            "captured_at": timezone.now().isoformat(),
            **changes,
        }

    def test_clock_in_and_out(self):
        attendance = clock_in(self.guard, self.shift.pk, self.gps())
        self.assertIsNone(attendance.clocked_out_at)
        attendance = clock_out(self.guard, self.shift.pk, self.gps())
        self.assertIsNotNone(attendance.clocked_out_at)
        self.assertIsNotNone(attendance.clock_out_gps)

    def test_wrong_guard_cannot_clock_in(self):
        with self.assertRaises(AttendanceError):
            clock_in(self.other, self.shift.pk, self.gps())
        self.assertEqual(Attendance.objects.count(), 0)

    def test_duplicate_clock_in_rejected(self):
        clock_in(self.guard, self.shift.pk, self.gps())
        with self.assertRaises(AttendanceError):
            clock_in(self.guard, self.shift.pk, self.gps())
        self.assertEqual(Attendance.objects.count(), 1)

    def test_outside_site_creates_no_attendance(self):
        with self.assertRaises(GPSValidationError):
            clock_in(self.guard, self.shift.pk, self.gps(latitude=1))
        self.assertEqual(Attendance.objects.count(), 0)

    def test_cancelled_shift_rejected(self):
        self.shift.status = "cancelled"
        self.shift.save()
        with self.assertRaises(AttendanceError):
            clock_in(self.guard, self.shift.pk, self.gps())

    def test_ended_shift_rejected(self):
        self.shift.ends_at = timezone.now() - timedelta(minutes=1)
        self.shift.save()
        with self.assertRaises(AttendanceError):
            clock_in(self.guard, self.shift.pk, self.gps())

    def test_early_clock_in_rejected(self):
        self.shift.starts_at = timezone.now() + timedelta(hours=1)
        self.shift.save()
        with self.assertRaises(AttendanceError):
            clock_in(self.guard, self.shift.pk, self.gps())

    def test_wrong_guard_cannot_clock_out(self):
        clock_in(self.guard, self.shift.pk, self.gps())
        with self.assertRaises(AttendanceError):
            clock_out(self.other, self.shift.pk, self.gps())
        self.assertIsNone(Attendance.objects.get().clocked_out_at)

    def test_clock_out_without_clock_in_rejected(self):
        with self.assertRaises(AttendanceError):
            clock_out(self.guard, self.shift.pk, self.gps())

    def test_gps_unavailable_requires_reason(self):
        clock_in(self.guard, self.shift.pk, self.gps())
        with self.assertRaises(AttendanceError):
            clock_out(self.guard, self.shift.pk)
        attendance = clock_out(
            self.guard, self.shift.pk, note="Location permission lost"
        )
        self.assertIsNotNone(attendance.clocked_out_at)
        self.assertIsNone(attendance.clock_out_gps)

    def test_clock_out_retry_keeps_original_time(self):
        clock_in(self.guard, self.shift.pk, self.gps())
        first = clock_out(self.guard, self.shift.pk, self.gps())
        second = clock_out(self.guard, self.shift.pk, self.gps())
        self.assertEqual(first.clocked_out_at, second.clocked_out_at)

    def test_cannot_open_two_attendances(self):
        clock_in(self.guard, self.shift.pk, self.gps())
        second_shift = Shift.objects.create(
            guard=self.guard,
            site=self.site,
            starts_at=self.shift.starts_at,
            ends_at=self.shift.ends_at,
        )
        with self.assertRaises(AttendanceError):
            clock_in(self.guard, second_shift.pk, self.gps())

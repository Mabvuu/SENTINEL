from datetime import timedelta
from types import SimpleNamespace

from django.test import SimpleTestCase
from django.utils import timezone

from .gps import GPSValidationError, distance_metres, validate_position


class GPSValidationTests(SimpleTestCase):
    def setUp(self):
        self.now = timezone.now()
        self.site = SimpleNamespace(
            latitude=0,
            longitude=0,
            radius_metres=100,
            max_accuracy_metres=50,
        )
        self.payload = {
            "latitude": 0,
            "longitude": 0,
            "accuracy_metres": 10,
            "captured_at": self.now.isoformat(),
        }

    def validate(self, **changes):
        return validate_position(
            self.site, {**self.payload, **changes}, now=self.now
        )

    def test_accepts_fresh_accurate_reading_inside_site(self):
        result = self.validate()
        self.assertEqual(result["distance_metres"], 0)

    def test_distance_calculation(self):
        self.assertAlmostEqual(
            distance_metres(0, 0, 0, 1), 111195.08, delta=1
        )

    def test_rejects_outside_site(self):
        with self.assertRaisesRegex(GPSValidationError, "outside"):
            self.validate(latitude=0.01)

    def test_rejects_uncertain_boundary(self):
        with self.assertRaisesRegex(GPSValidationError, "overlaps"):
            self.validate(latitude=0.00085, accuracy_metres=20)

    def test_rejects_poor_accuracy(self):
        with self.assertRaisesRegex(GPSValidationError, "accuracy is too low"):
            self.validate(accuracy_metres=100)

    def test_rejects_stale_reading(self):
        with self.assertRaisesRegex(GPSValidationError, "expired"):
            self.validate(
                captured_at=(self.now - timedelta(seconds=31)).isoformat()
            )

    def test_rejects_future_reading(self):
        with self.assertRaisesRegex(GPSValidationError, "future"):
            self.validate(
                captured_at=(self.now + timedelta(seconds=10)).isoformat()
            )

    def test_rejects_missing_timezone(self):
        with self.assertRaisesRegex(GPSValidationError, "timezone"):
            self.validate(
                captured_at=self.now.replace(tzinfo=None).isoformat()
            )

    def test_rejects_invalid_coordinates(self):
        for value in (None, True, "NaN", "Infinity", 91, -91):
            with self.subTest(value=value):
                with self.assertRaises(GPSValidationError):
                    self.validate(latitude=value)

    def test_rejects_invalid_accuracy(self):
        for value in (None, True, 0, -10, "NaN"):
            with self.subTest(value=value):
                with self.assertRaises(GPSValidationError):
                    self.validate(accuracy_metres=value)

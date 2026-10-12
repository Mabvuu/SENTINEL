from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from operations.models import Client, Site, Shift
from .models import Attendance


class GuardAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        self.password = "Test-only-password-482!"
        users = get_user_model()
        self.guard = users.objects.create_user(
            username="api_guard",
            password=self.password,
            role="guard",
        )
        self.other = users.objects.create_user(
            username="other_guard",
            password=self.password,
            role="guard",
        )
        client = Client.objects.create(name="API test client")
        site = Site.objects.create(
            client=client, name="API test site",
            address="Test address", latitude=0, longitude=0,
        )
        now = timezone.now()
        self.shift = Shift.objects.create(
            guard=self.guard, site=site,
            starts_at=now - timedelta(minutes=5),
            ends_at=now + timedelta(hours=8),
        )
        self.other_shift = Shift.objects.create(
            guard=self.other, site=site,
            starts_at=self.shift.starts_at,
            ends_at=self.shift.ends_at,
        )

    def login(self, username="api_guard"):
        response = self.client.post("/api/auth/login/", {
            "username": username,
            "password": self.password,
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.client.credentials(
            HTTP_AUTHORIZATION="Bearer " + response.data["access"]
        )
        return response.data

    def gps(self):
        return {
            "latitude": 0,
            "longitude": 0,
            "accuracy_metres": 10,
            "captured_at": timezone.now().isoformat(),
        }

    def test_login_and_identity(self):
        self.login()
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.guard.pk)

    def test_wrong_password_rejected(self):
        response = self.client.post("/api/auth/login/", {
            "username": "api_guard", "password": "wrong",
        }, format="json")
        self.assertEqual(response.status_code, 401)

    def test_anonymous_access_rejected(self):
        response = self.client.get("/api/shifts/mine/")
        self.assertEqual(response.status_code, 401)
        response = self.client.post(
            f"/api/shifts/{self.shift.pk}/clock-in/",
            {"gps": self.gps()}, format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_only_own_shifts_visible(self):
        self.login()
        response = self.client.get("/api/shifts/mine/")
        self.assertEqual(response.status_code, 200)
        ids = [item["id"] for item in response.data["results"]]
        self.assertEqual(ids, [self.shift.pk])

    def test_clock_in_and_out_through_api(self):
        self.login()
        response = self.client.post(
            f"/api/shifts/{self.shift.pk}/clock-in/",
            {"gps": self.gps()}, format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        response = self.client.post(
            f"/api/shifts/{self.shift.pk}/clock-out/",
            {"gps": self.gps()}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNotNone(Attendance.objects.get().clocked_out_at)

    def test_cannot_clock_in_for_other_guard(self):
        self.login()
        response = self.client.post(
            f"/api/shifts/{self.other_shift.pk}/clock-in/",
            {"gps": self.gps()}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Attendance.objects.exists())

    def test_malformed_gps_returns_400(self):
        self.login()
        response = self.client.post(
            f"/api/shifts/{self.shift.pk}/clock-in/",
            {"gps": ["invalid"]}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Attendance.objects.exists())

    def test_deactivated_account_cannot_use_existing_token(self):
        self.login()
        self.guard.is_active = False
        self.guard.save()
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_refresh_rotation_invalidates_old_refresh(self):
        tokens = self.login()
        response = self.client.post("/api/auth/refresh/", {
            "refresh": tokens["refresh"],
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("refresh", response.data)

        response = self.client.post("/api/auth/refresh/", {
            "refresh": tokens["refresh"],
        }, format="json")
        self.assertEqual(response.status_code, 401)

    def test_logout_blocks_refresh(self):
        tokens = self.login()
        response = self.client.post("/api/auth/logout/", {
            "refresh": tokens["refresh"],
        }, format="json")
        self.assertEqual(response.status_code, 200)

        response = self.client.post("/api/auth/refresh/", {
            "refresh": tokens["refresh"],
        }, format="json")
        self.assertEqual(response.status_code, 401)

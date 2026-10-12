from datetime import datetime
from math import asin, cos, isfinite, radians, sin, sqrt

from django.utils import timezone


class GPSValidationError(ValueError):
    pass


def number(value, label, minimum, maximum):
    if isinstance(value, bool):
        raise GPSValidationError(f"{label} must be a number.")

    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        raise GPSValidationError(f"{label} must be a number.")

    if not isfinite(result) or not minimum <= result <= maximum:
        raise GPSValidationError(f"{label} is outside the allowed range.")

    return result


def distance_metres(latitude, longitude, site_latitude, site_longitude):
    lat1 = radians(latitude)
    lat2 = radians(site_latitude)
    delta_lat = radians(site_latitude - latitude)
    delta_lon = radians(site_longitude - longitude)

    value = (
        sin(delta_lat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    )
    return 6371008.8 * 2 * asin(sqrt(max(0.0, min(1.0, value))))


def validate_position(site, payload, *, now=None):
    if not isinstance(payload, dict):
        raise GPSValidationError("Send a GPS object.")

    latitude = number(payload.get("latitude"), "Latitude", -90, 90)
    longitude = number(payload.get("longitude"), "Longitude", -180, 180)
    accuracy = number(
        payload.get("accuracy_metres"), "GPS accuracy", 0.01, 100000
    )

    captured_at = payload.get("captured_at")
    if not isinstance(captured_at, str):
        raise GPSValidationError("A GPS capture timestamp is required.")

    try:
        captured_at = datetime.fromisoformat(
            captured_at.replace("Z", "+00:00")
        )
    except ValueError:
        raise GPSValidationError("The GPS timestamp is invalid.")

    if timezone.is_naive(captured_at):
        raise GPSValidationError("The GPS timestamp must include a timezone.")

    now = now or timezone.now()
    age = (now - captured_at).total_seconds()

    if age < -5:
        raise GPSValidationError(
            "The GPS timestamp is in the future. Check the phone clock."
        )
    if age > 30:
        raise GPSValidationError("GPS reading expired. Get a fresh location.")

    if accuracy > site.max_accuracy_metres:
        raise GPSValidationError(
            "GPS accuracy is too low. Move to an open area and retry."
        )

    distance = distance_metres(
        latitude,
        longitude,
        float(site.latitude),
        float(site.longitude),
    )

    # Include the reported uncertainty instead of trusting the centre alone.
    if distance - accuracy > site.radius_metres:
        raise GPSValidationError("You are outside the assigned site boundary.")

    if distance + accuracy > site.radius_metres:
        raise GPSValidationError(
            "GPS overlaps the site boundary. Move further inside and retry."
        )

    return {
        "latitude": latitude,
        "longitude": longitude,
        "accuracy_metres": accuracy,
        "distance_metres": round(distance, 2),
        "captured_at": captured_at.isoformat(),
        "received_at": now.isoformat(),
    }

import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from django.core.cache import cache
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from operations.client_api import ClientPagination
from .api import PrivateAPIView
from .control_room import IsControlRoom
from .models import Attendance, PatrolPoint


class PatrolThrottle(UserRateThrottle):
    scope = 'patrol_console'
    rate = '90/min'


def scoped(user):
    records = Attendance.objects.select_related('guard', 'shift__site', 'latest_location')
    if not user.is_superuser and user.role != 'admin':
        records = records.filter(shift__site__supervisors=user)
    return records


def describe(record):
    location = getattr(record, 'latest_location', None)
    now = timezone.now()
    active = not record.clocked_out_at and record.shift.ends_at > now and record.shift.status == 'scheduled' and record.guard.is_active and record.shift.guard_id == record.guard_id and record.shift.site.is_active and record.shift.site.client.is_active
    fresh = location and -5 <= (now-location.captured_at).total_seconds() <= 90 and 0 <= (now-location.received_at).total_seconds() <= 90
    return {'id': record.id, 'shift_id': record.shift_id, 'guard': record.guard.get_full_name() or record.guard.username,
        'site': record.shift.site.name, 'boundary': record.site_snapshot,
        'started_at': record.clocked_in_at, 'ended_at': record.clocked_out_at,
        'shift_ends_at': record.shift.ends_at, 'active': active,
        'status': ('ended' if not active else location.status if fresh else 'stale' if location else 'unavailable'),
        'last_position': {'latitude': location.latitude, 'longitude': location.longitude, 'accuracy_metres': location.accuracy_metres, 'captured_at': location.captured_at, 'received_at': location.received_at} if location else None}


class PatrolView(PrivateAPIView):
    permission_classes = [IsControlRoom]
    throttle_classes = [PatrolThrottle]

    def get(self, request):
        attendance_id = request.query_params.get('attendance')
        records = scoped(request.user)
        if not attendance_id:
            paginator = ClientPagination()
            return paginator.get_paginated_response([describe(r) for r in paginator.paginate_queryset(records.order_by('-clocked_in_at', '-id'), request)])
        pk = serializers.IntegerField(min_value=1).run_validation(attendance_id)
        record = get_object_or_404(records, pk=pk)
        after = serializers.IntegerField(min_value=0).run_validation(request.query_params.get('after', '0'))
        points = record.patrol_points.all()
        batch = list(points.filter(id__gt=after).order_by('id')[:501])
        more = len(batch) > 500
        batch = batch[:500]
        return Response({'attendance': describe(record), 'server_time': timezone.now(),
            'estimated_distance_metres': round(points.aggregate(total=Sum('distance_added'))['total'] or 0, 2),
            'points': [{'id': p.id, 'latitude': p.latitude, 'longitude': p.longitude, 'accuracy_metres': p.accuracy_metres,
                        'captured_at': p.captured_at, 'usable': p.usable, 'is_anchor': p.is_anchor,
                        'segment_start': p.segment_start, 'reason': p.reason} for p in batch],
            'next_after': batch[-1].id if batch else after, 'has_more': more})


class AddressThrottle(UserRateThrottle):
    scope = 'site_address_search'
    rate = '20/min'


class AddressSearchView(PrivateAPIView):
    permission_classes = [IsControlRoom]
    throttle_classes = [AddressThrottle]
    def get(self, request):
        key = os.environ.get('GEOAPIFY_API_KEY', '')
        if not key:
            return Response({'detail': 'Address search needs a Geoapify API key. You can still place the site pin on the map.'}, status=503)
        query = request.query_params.get('q', '').strip()
        if not 3 <= len(query) <= 200:
            return Response({'detail': 'Enter an address between 3 and 200 characters.'}, status=400)
        import hashlib
        cache_key = 'sentinel-geocode-' + hashlib.sha256(query.casefold().encode()).hexdigest()
        saved = cache.get(cache_key)
        if saved is not None:
            return Response({'results': saved})
        params = urlencode({'text': query, 'format': 'json', 'limit': 5, 'bias': 'countrycode:zw', 'apiKey': key})
        try:
            with urlopen(Request('https://api.geoapify.com/v1/geocode/autocomplete?' + params, headers={'Accept': 'application/json'}), timeout=8) as response:
                data = json.load(response)
            result = [{'address': r['formatted'], 'latitude': r['lat'], 'longitude': r['lon']} for r in data.get('results', []) if all(k in r for k in ('formatted','lat','lon'))]
            cache.set(cache_key, result, 86400)
            return Response({'results': result})
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError):
            return Response({'detail': 'Address search is unavailable. Check the API key or place the pin manually.'}, status=502)

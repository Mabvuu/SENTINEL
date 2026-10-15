from datetime import timedelta
from math import cos, radians, isfinite
from types import SimpleNamespace
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from operations.models import Site, Shift
from .api import PrivateAPIView, IsGuard
from .control_room import IsControlRoom
from .gps import validate_position, GPSValidationError, distance_metres
from .services import locked_guard
from .models import Attendance
from .round_models import PatrolRoute, ScheduledRound, CheckpointVisit


class RoundThrottle(UserRateThrottle):
    scope = 'rounds'
    rate = '120/min'


def sites_for(user):
    q = Site.objects.select_related('client')
    return q if user.is_superuser or user.role == 'admin' else q.filter(supervisors=user)


def rounds_for(user):
    q = ScheduledRound.objects.select_related('shift__site__client', 'guard', 'attendance__latest_location').prefetch_related('visits')
    if user.role == 'guard' and not user.is_superuser:
        return q.filter(guard=user, shift__guard=user)
    return q.filter(shift__site__in=sites_for(user))


class Coordinate(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-85, max_value=85)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    def validate(self, data):
        if not all(isfinite(data[k]) for k in ['latitude','longitude']):
            raise serializers.ValidationError('Coordinates must be finite numbers.')
        return data


class Checkpoint(Coordinate):
    name = serializers.CharField(max_length=100)
    radius_metres = serializers.IntegerField(min_value=10, max_value=100, default=20)


class RouteInput(serializers.Serializer):
    site = serializers.IntegerField(min_value=1)
    name = serializers.CharField(max_length=120)
    boundary = Coordinate(many=True, min_length=3, max_length=80)
    checkpoints = Checkpoint(many=True, min_length=1, max_length=30)
    must_follow_order = serializers.BooleanField(default=True)


def plane(points):
    lat = sum(p['latitude'] for p in points) / len(points)
    lon = points[0]['longitude']
    lat0 = points[0]['latitude']
    return [((p['longitude']-lon)*111195*cos(radians(lat)), (p['latitude']-lat0)*111195) for p in points]


def area(points):
    p = plane(points)
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))) / 2


def simple_polygon(points):
    p = plane(points)
    def cross(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    edges = list(zip(p,p[1:]+p[:1]))
    for i,(a,b) in enumerate(edges):
        if (a[0]-b[0])**2+(a[1]-b[1])**2 < 1: return False
        for j,(c,d) in enumerate(edges):
            if j <= i+1 or (i == 0 and j == len(edges)-1): continue
            if cross(a,b,c)*cross(a,b,d) <= 0 and cross(c,d,a)*cross(c,d,b) <= 0:
                if max(min(a[0],b[0]),min(c[0],d[0])) <= min(max(a[0],b[0]),max(c[0],d[0])) and max(min(a[1],b[1]),min(c[1],d[1])) <= min(max(a[1],b[1]),max(c[1],d[1])):
                    return False
    return True


def in_outline(point, outline):
    # Ray casting with a metre of tolerance for checkpoint centres on the fence.
    projected = plane(outline + [point])
    x, y = projected[-1]; polygon = projected[:-1]
    inside = False
    for a, b in zip(polygon, polygon[1:]+polygon[:1]):
        dx, dy = b[0]-a[0], b[1]-a[1]
        fraction = max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
        if (x-a[0]-fraction*dx)**2+(y-a[1]-fraction*dy)**2 <= 1:
            return True
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside


def route_json(r):
    return {'id':r.id, 'site':r.site_id, 'name':r.name, 'boundary':r.boundary, 'checkpoints':r.checkpoints, 'must_follow_order':r.must_follow_order, 'area_m2':round(area(r.boundary),1)}


def round_json(r, now):
    visits = {v.checkpoint:v for v in r.visits.all()}
    cancelled = bool(r.cancelled_at or r.shift.status != 'scheduled' or r.shift.guard_id != r.guard_id or not r.guard.is_active or not r.shift.site.is_active or not r.shift.site.client.is_active)
    elapsed = now > r.due_at or now >= r.shift.ends_at or bool(r.attendance and r.attendance.clocked_out_at)
    status = 'cancelled' if cancelled else 'completed' if r.finished_at else 'incomplete' if elapsed else 'in_progress' if r.started_at else 'scheduled'
    checkpoints = []
    total = len(r.snapshot['checkpoints'])
    for i,cp in enumerate(r.snapshot['checkpoints']):
        due = r.starts_at + (r.due_at-r.starts_at)*(i+1)/total
        v = visits.get(i)
        state = ('late' if v.checked_at > due else 'checked') if v else 'cancelled' if cancelled else 'missed' if elapsed else 'overdue' if now > due else 'pending'
        checkpoints.append({**cp, 'index':i, 'due_at':due, 'checked_at':v.checked_at if v else None, 'status':state})
    location = getattr(r.attendance, 'latest_location', None) if r.attendance else None
    fresh = bool(location and -5 <= (now-location.captured_at).total_seconds() <= 90 and 0 <= (now-location.received_at).total_seconds() <= 90)
    pos = {'latitude':location.latitude, 'longitude':location.longitude, 'accuracy_metres':location.accuracy_metres, 'captured_at':location.captured_at} if location else None
    return {'id':r.id, 'shift':r.shift_id, 'attendance':r.attendance_id, 'site':r.shift.site_id, 'site_name':r.shift.site.name,
        'guard':r.guard.get_full_name() or r.guard.username, 'guard_id':r.guard_id, 'name':r.snapshot['name'], 'boundary':r.snapshot['boundary'],
        'area_m2':round(area(r.snapshot['boundary']),1), 'must_follow_order':r.snapshot['must_follow_order'], 'checkpoints':checkpoints,
        'starts_at':r.starts_at, 'due_at':r.due_at, 'started_at':r.started_at, 'finished_at':r.finished_at, 'status':status,
        'completed':len(visits), 'total':total, 'last_position':pos, 'location_fresh':fresh and status == 'in_progress',
        'late_count':sum(cp['status'] in ['late','missed','overdue'] for cp in checkpoints)}


class AdminRounds(PrivateAPIView):
    permission_classes = [IsAuthenticated, IsControlRoom]
    throttle_classes = [RoundThrottle]
    def get(self,request,resource):
        sites = sites_for(request.user)
        if resource == 'choices':
            shifts = Shift.objects.filter(site__in=sites, status='scheduled', ends_at__gt=timezone.now()).select_related('guard','site').order_by('starts_at')[:300]
            return Response({'sites':[{'id':s.id,'name':s.name,'latitude':float(s.latitude),'longitude':float(s.longitude),'radius_metres':s.radius_metres} for s in sites.filter(is_active=True,client__is_active=True).order_by('name')[:300]],
                'shifts':[{'id':s.id,'site':s.site_id,'label':f'{s.guard} · {s.site.name}', 'starts_at':s.starts_at, 'ends_at':s.ends_at} for s in shifts]})
        if resource == 'routes':
            return Response({'results':[route_json(r) for r in PatrolRoute.objects.filter(site__in=sites)[:300]]})
        if resource == 'board':
            q = rounds_for(request.user)
            day = serializers.DateField().run_validation(request.query_params.get('date', timezone.localdate().isoformat()))
            from zoneinfo import ZoneInfo
            from datetime import datetime, time
            start = datetime.combine(day,time.min,ZoneInfo('Africa/Harare'))
            q = q.filter(starts_at__lt=start+timedelta(days=1), due_at__gte=start)
            if request.query_params.get('site'):
                q = q.filter(shift__site_id=serializers.IntegerField(min_value=1).run_validation(request.query_params['site']))
            from rest_framework.pagination import PageNumberPagination
            paginator=PageNumberPagination(); paginator.page_size=100
            now=timezone.now()
            batch=paginator.paginate_queryset(q,request)
            return Response({'count':paginator.page.paginator.count,'next':paginator.get_next_link(),'results':[round_json(r,now) for r in batch], 'server_time':now})
        return Response({'detail':'Not found.'},status=404)

    @transaction.atomic
    def post(self,request,resource):
        if resource == 'routes':
            serializer=RouteInput(data=request.data); serializer.is_valid(raise_exception=True); data=serializer.validated_data
            site=get_object_or_404(sites_for(request.user).filter(is_active=True,client__is_active=True),pk=data.pop('site'))
            if not simple_polygon(data['boundary']) or area(data['boundary']) < 10:
                raise ValidationError({'detail':'Draw a non-crossing property outline of at least 10 square metres.'})
            for point in data['boundary']+data['checkpoints']:
                if distance_metres(point['latitude'],point['longitude'],float(site.latitude),float(site.longitude)) > 10000:
                    raise ValidationError({'detail':'Boundary and checkpoints must be within 10 km of the selected site.'})
            if any(not in_outline(cp, data['boundary']) for cp in data['checkpoints']):
                raise ValidationError({'detail':'Place checkpoint centres inside or on the property outline.'})
            r=PatrolRoute.objects.create(site=site,created_by=request.user,**data)
            return Response(route_json(r),status=201)
        if resource == 'schedule':
            class Input(serializers.Serializer):
                route=serializers.IntegerField(min_value=1)
                shift=serializers.IntegerField(min_value=1)
                starts_at=serializers.DateTimeField()
                due_at=serializers.DateTimeField()
            s=Input(data=request.data);s.is_valid(raise_exception=True);d=s.validated_data
            shift=get_object_or_404(Shift.objects.select_for_update().filter(site__in=sites_for(request.user)),pk=d['shift'])
            route=get_object_or_404(PatrolRoute,pk=d['route'],site=shift.site)
            if shift.status != 'scheduled' or not shift.guard.is_active or not shift.site.is_active or not shift.site.client.is_active:
                raise ValidationError({'detail':'Choose an active guard shift and site.'})
            if not shift.starts_at <= d['starts_at'] < d['due_at'] <= shift.ends_at or d['due_at'] <= timezone.now():
                raise ValidationError({'detail':'Round times must be inside the shift and finish in the future.'})
            if ScheduledRound.objects.filter(shift=shift,cancelled_at__isnull=True,starts_at__lt=d['due_at'],due_at__gt=d['starts_at']).exists():
                raise ValidationError({'detail':'This shift already has a round during that time.'})
            r=ScheduledRound.objects.create(shift=shift,guard=shift.guard,route=route,snapshot=route_json(route),starts_at=d['starts_at'],due_at=d['due_at'])
            return Response(round_json(r,timezone.now()),status=201)
        if resource == 'cancel':
            pk=serializers.IntegerField(min_value=1).run_validation(request.data.get('id'))
            r=get_object_or_404(ScheduledRound.objects.select_for_update().filter(shift__site__in=sites_for(request.user)),pk=pk)
            if r.started_at: raise ValidationError({'detail':'A started round cannot be cancelled.'})
            if not r.cancelled_at: r.cancelled_at=timezone.now();r.save(update_fields=['cancelled_at'])
            return Response({'ok':True})
        return Response({'detail':'Not found.'},status=404)


class GuardRounds(PrivateAPIView):
    permission_classes=[IsAuthenticated, IsGuard]
    throttle_classes=[RoundThrottle]
    def get(self,request):
        shift=serializers.IntegerField(min_value=1).run_validation(request.query_params.get('shift'))
        return Response({'results':[round_json(r,timezone.now()) for r in rounds_for(request.user).filter(shift_id=shift).order_by('starts_at')[:100]], 'server_time':timezone.now()})

    @transaction.atomic
    def post(self,request):
        locked_guard(request.user)
        pk=serializers.IntegerField(min_value=1).run_validation(request.data.get('id'))
        # Lock the attendance before the round; clock-out uses the same guard lock.
        r=get_object_or_404(ScheduledRound.objects.select_for_update(),pk=pk,guard=request.user,shift__guard=request.user)
        now=timezone.now()
        action=serializers.ChoiceField(choices=['start','check','finish']).run_validation(request.data.get('action'))
        if r.finished_at and action=='finish': return Response(round_json(r,now))
        if r.cancelled_at or r.shift.status!='scheduled' or not r.shift.site.is_active or not r.shift.site.client.is_active or not r.starts_at <= now < min(r.due_at,r.shift.ends_at):
            raise ValidationError({'detail':'This round is not currently open.'})
        attendance=get_object_or_404(Attendance.objects.select_for_update(),shift=r.shift,guard=request.user,clocked_out_at__isnull=True)
        if r.finished_at: raise ValidationError({'detail':'This round is finished.'})
        if action=='start':
            if not r.started_at:
                try: validate_position(SimpleNamespace(**attendance.site_snapshot),request.data.get('gps'),now=now)
                except GPSValidationError as e: raise ValidationError({'detail':str(e)})
                r.started_at=now;r.attendance=attendance;r.save(update_fields=['started_at','attendance'])
        else:
            if not r.started_at: raise ValidationError({'detail':'Start the round first.'})
            if action=='check':
                index=serializers.IntegerField(min_value=0,max_value=len(r.snapshot['checkpoints'])-1).run_validation(request.data.get('checkpoint'))
                existing=set(r.visits.values_list('checkpoint',flat=True))
                if index in existing: return Response(round_json(r,now))
                if r.snapshot['must_follow_order'] and index!=next(i for i in range(len(r.snapshot['checkpoints'])) if i not in existing):
                    raise ValidationError({'detail':'Visit the checkpoints in the planned order.'})
                cp=r.snapshot['checkpoints'][index]
                try: reading=validate_position(SimpleNamespace(**cp,max_accuracy_metres=min(30,cp['radius_metres'])),request.data.get('gps'),now=now)
                except GPSValidationError as e: raise ValidationError({'detail':str(e).replace('site boundary','checkpoint radius')})
                from django.utils.dateparse import parse_datetime
                if parse_datetime(reading['captured_at']) < r.started_at:
                    raise ValidationError({'detail':'Take a fresh GPS reading after starting the round.'})
                CheckpointVisit.objects.create(patrol_round=r,checkpoint=index,gps=reading,checked_at=now)
            elif r.visits.count()!=len(r.snapshot['checkpoints']):
                raise ValidationError({'detail':'Check in at every checkpoint before finishing.'})
            else:
                r.finished_at=now;r.save(update_fields=['finished_at'])
        return Response(round_json(r,now))

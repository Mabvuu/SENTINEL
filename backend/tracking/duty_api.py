from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import Q, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from operations.models import Shift
from .api import PrivateAPIView, IsGuard, ShiftSerializer
from .control_room import IsControlRoom
from .models import Attendance
from .duty_models import ShiftReport
from .round_models import ScheduledRound, PatrolRoute
from .round_api import sites_for, round_json, route_json, RoundThrottle
from .services import locked_guard


def shifts_base():
    return Shift.objects.select_related('site__client','guard','attendance__latest_location','attendance__duty_report').prefetch_related(Prefetch('patrol_rounds',queryset=ScheduledRound.objects.select_related('shift__site__client','guard','attendance__latest_location').prefetch_related('visits').order_by('starts_at','id')))


def summary(shift):
    now = timezone.now()
    attendance = getattr(shift, 'attendance', None)
    rounds = [round_json(r, now) for r in shift.patrol_rounds.all()]
    if attendance and attendance.clocked_out_at:
        for r in rounds:
            if r['status'] in ['scheduled','in_progress']:
                r['status']='incomplete'
                for cp in r['checkpoints']:
                    if not cp['checked_at']:cp['status']='missed'
    required = [r for r in rounds if r['status'] != 'cancelled']
    done = sum(r['status'] == 'completed' for r in required)
    if attendance:
        status = 'complete' if attendance.clocked_out_at else 'on_duty'
    else:
        status = 'cancelled' if shift.status != 'scheduled' else 'missed' if shift.ends_at <= now else 'scheduled'
    report = getattr(attendance,'duty_report',None) if attendance else None
    location = getattr(attendance,'latest_location',None) if attendance else None
    result = dict(ShiftSerializer(shift).data)
    result.update(guard_name=shift.guard.get_full_name() or shift.guard.username, duty_status=status,
        rounds=rounds, required_rounds=len(required), completed_rounds=done,
        missed_rounds=sum(r['status']=='incomplete' for r in required),
        checkpoints_checked=sum(r['completed'] for r in required),
        checkpoints_required=sum(r['total'] for r in required),
        report={'narrative':report.narrative,'missed_reason':report.missed_reason,'incidents':report.incidents,'evidence':report.evidence,'submitted_at':report.submitted_at} if report else None,
        location={'latitude':location.latitude,'longitude':location.longitude,'accuracy_metres':location.accuracy_metres,'captured_at':location.captured_at,'fresh':bool(status=='on_duty' and -5 <= (now-location.captured_at).total_seconds() <= 90 and 0 <= (now-location.received_at).total_seconds() <= 90)} if location else None)
    result['report_draft'] = (f"Shift at {shift.site.name}. {done} of {len(required)} required patrol rounds completed. "
        f"{result['checkpoints_checked']} of {result['checkpoints_required']} checkpoint visits recorded. "
        + ('No patrol rounds were scheduled. ' if not required else '')
        + 'Add your observations and handover notes below.')
    return result


def paginated(request,q):
    pager=PageNumberPagination();pager.page_size=30
    batch=pager.paginate_queryset(q,request)
    return pager.get_paginated_response([summary(s) for s in batch])


class GuardDuty(PrivateAPIView):
    permission_classes=[IsAuthenticated,IsGuard]
    throttle_classes=[RoundThrottle]
    def get(self,request):
        q=shifts_base().filter(guard=request.user)
        if request.query_params.get('shift'):
            return Response(summary(get_object_or_404(q,pk=serializers.IntegerField(min_value=1).run_validation(request.query_params['shift']))))
        history=request.query_params.get('history')=='1'
        live=Q(attendance__clocked_out_at__isnull=True,attendance__isnull=False)|Q(ends_at__gt=timezone.now(),attendance__isnull=True,status='scheduled')
        q=q.exclude(live) if history else q.filter(live)
        return paginated(request,q.order_by('starts_at','id'))

    @transaction.atomic
    def post(self,request):
        locked_guard(request.user)
        class Input(serializers.Serializer):
            shift=serializers.IntegerField(min_value=1)
            narrative=serializers.CharField(max_length=4000)
            missed_reason=serializers.CharField(max_length=2000,allow_blank=True,default='')
            incidents=serializers.CharField(max_length=2000,allow_blank=True,default='')
        form=Input(data=request.data);form.is_valid(raise_exception=True);d=form.validated_data
        # Report is final after clock-out; patrol actions can no longer alter its evidence.
        a=get_object_or_404(Attendance.objects.select_for_update(),shift_id=d['shift'],guard=request.user,shift__guard=request.user)
        if not a.clocked_out_at:raise ValidationError({'detail':'Clock out first, then submit your end-of-shift report.'})
        if ShiftReport.objects.filter(attendance=a).exists():raise ValidationError({'detail':'This report has already been submitted.'})
        s=get_object_or_404(shifts_base(),pk=d['shift']); evidence=summary(s)
        if evidence['completed_rounds'] < evidence['required_rounds'] and not d['missed_reason'].strip():
            raise ValidationError({'detail':'Explain why some required rounds were not completed.'})
        snapshot={key:evidence[key] for key in ['required_rounds','completed_rounds','checkpoints_checked','checkpoints_required']}
        snapshot['rounds']=[{'id':r['id'],'status':r['status'],'checked':r['completed'],'required':r['total']} for r in evidence['rounds']]
        ShiftReport.objects.create(attendance=a,author=request.user,narrative=d['narrative'],missed_reason=d['missed_reason'],incidents=d['incidents'],evidence=snapshot)
        return Response(summary(get_object_or_404(shifts_base(),pk=s.pk)),status=201)


class AdminDuty(PrivateAPIView):
    permission_classes=[IsAuthenticated,IsControlRoom]
    throttle_classes=[RoundThrottle]
    def get(self,request):
        q=shifts_base().filter(site__in=sites_for(request.user))
        if request.query_params.get('shift'):
            s=get_object_or_404(q,pk=serializers.IntegerField(min_value=1).run_validation(request.query_params['shift']))
            return Response({'shift':summary(s),'routes':[{'id':r.id,'name':r.name} for r in PatrolRoute.objects.filter(site=s.site)]})
        day=serializers.DateField().run_validation(request.query_params.get('date',timezone.now().astimezone(ZoneInfo('Africa/Harare')).date().isoformat()))
        start=datetime.combine(day,time.min,ZoneInfo('Africa/Harare'))
        return paginated(request,q.filter(starts_at__lt=start+timedelta(days=1),ends_at__gt=start).order_by('starts_at','id'))

    @transaction.atomic
    def post(self,request):
        class Input(serializers.Serializer):
            shift=serializers.IntegerField(min_value=1)
            route=serializers.IntegerField(min_value=1)
            count=serializers.IntegerField(min_value=1,max_value=24)
            starts_at=serializers.DateTimeField()
            due_at=serializers.DateTimeField()
        form=Input(data=request.data);form.is_valid(raise_exception=True);d=form.validated_data
        s=get_object_or_404(Shift.objects.select_for_update().filter(site__in=sites_for(request.user)),pk=d['shift'])
        r=get_object_or_404(PatrolRoute,pk=d['route'],site=s.site)
        if s.status!='scheduled' or not s.guard.is_active or not s.site.is_active or not s.site.client.is_active:
            raise ValidationError({'detail':'Choose an active guard and site.'})
        if Attendance.objects.filter(shift=s,clocked_out_at__isnull=False).exists():raise ValidationError({'detail':'This shift has already been completed.'})
        if not s.starts_at <= d['starts_at'] < d['due_at'] <= s.ends_at or d['starts_at'] < timezone.now():
            raise ValidationError({'detail':'Choose a future period inside this shift.'})
        existing=ScheduledRound.objects.filter(shift=s,cancelled_at__isnull=True)
        if existing.exists():raise ValidationError({'detail':'This shift already has a patrol plan. Use Routes & checkpoints to manage existing rounds; no duplicate plan was created.'})
        window=(d['due_at']-d['starts_at'])/d['count']
        if window.total_seconds()<300:raise ValidationError({'detail':'Allow at least five minutes per round.'})
        for i in range(d['count']):
            ScheduledRound.objects.create(shift=s,guard=s.guard,route=r,snapshot=route_json(r),starts_at=d['starts_at']+i*window,due_at=d['starts_at']+(i+1)*window)
        return Response(summary(get_object_or_404(shifts_base(),pk=s.pk)),status=201)

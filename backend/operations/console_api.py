from decimal import Decimal
from django.db import transaction
from django.db.models import Q, Sum, Count, F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from tracking.api import PrivateAPIView
from tracking.control_room import IsControlRoom
from tracking.models import Attendance
from operations.client_api import ClientPagination
from operations.models import Client, Site, Shift, OperationsEntry, Contract, Invoice


def is_admin(user):
    return user.is_superuser or user.role == "admin"


def sites_for(user):
    result = Site.objects.all()
    return result if is_admin(user) else result.filter(supervisors=user)


class EntrySerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)
    class Meta:
        model = OperationsEntry
        fields = ("id", "kind", "site", "site_name", "title", "notes", "severity", "status", "created_by_name", "created_at", "resolved_at")
        read_only_fields = ("status", "created_at", "resolved_at")
        extra_kwargs = {"notes": {"max_length": 8000}}

    def validate_site(self, site):
        if not sites_for(self.context["request"].user).filter(pk=site.pk, is_active=True, client__is_active=True).exists():
            raise ValidationError("Choose an active site you supervise.")
        return site


class ContractSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    class Meta:
        model = Contract
        fields = ("id", "client", "client_name", "reference", "starts_on", "ends_on", "monthly_fee", "notes", "created_at")
        read_only_fields = ("created_at",)
        extra_kwargs = {"notes": {"max_length": 8000}}
    def validate(self, data):
        if data["ends_on"] < data["starts_on"]:
            raise ValidationError("Contract end must be on or after start.")
        if not data["client"].is_active:
            raise ValidationError("Choose an active client.")
        return data


class InvoiceSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="contract.client.name", read_only=True)
    contract_reference = serializers.CharField(source="contract.reference", read_only=True)
    status = serializers.SerializerMethodField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    class Meta:
        model = Invoice
        fields = ("id", "contract", "contract_reference", "client_name", "reference", "amount", "due_on", "notes", "paid_at", "status", "created_at")
        read_only_fields = ("paid_at", "created_at")
        extra_kwargs = {"notes": {"max_length": 8000}}
    def get_status(self, obj):
        return "paid" if obj.paid_at else "overdue" if obj.due_on < timezone.localdate() else "unpaid"


class ConsoleView(PrivateAPIView):
    permission_classes = [IsControlRoom]

    def get(self, request, resource):
        user = request.user
        scope = sites_for(user)
        if resource == "choices":
            return Response({"sites": list(scope.filter(is_active=True, client__is_active=True).values("id", "name")), "clients": list(Client.objects.filter(is_active=True).values("id", "name")) if is_admin(user) else [], "contracts": list(Contract.objects.values("id", "reference")) if is_admin(user) else []})
        if resource == "summary":
            now = timezone.now()
            active_sites = scope.filter(is_active=True, client__is_active=True)
            present = Attendance.objects.filter(shift__site__in=active_sites, clocked_out_at__isnull=True, shift__ends_at__gt=now, shift__status="scheduled", guard__is_active=True, shift__guard_id=F("guard_id"))
            counts = dict(present.values("shift__site_id").annotate(n=Count("id")).values_list("shift__site_id", "n"))
            coverage = [{"id": s.id, "name": s.name, "required": s.required_guards, "clocked_in": counts.get(s.id, 0)} for s in active_sites]
            overdue = Invoice.objects.filter(paid_at__isnull=True, due_on__lt=timezone.localdate()).aggregate(total=Sum("amount"))["total"] if is_admin(user) else None
            return Response({"server_time": now.isoformat(), "active_sites": len(coverage), "clocked_in": sum(counts.values()), "empty_posts": sum(max(0, s["required"] - s["clocked_in"]) for s in coverage), "open_incidents": OperationsEntry.objects.filter(site__in=scope, kind="incident", status="open").count(), "overdue_usd": str(overdue or 0) if is_admin(user) else None, "coverage": coverage})
        if resource in ("entries", "contracts", "invoices"):
            if resource == "entries":
                records = OperationsEntry.objects.filter(site__in=scope).select_related("site", "created_by")
                kind = request.query_params.get("kind")
                if kind:
                    records = records.filter(kind=kind)
                serializer = EntrySerializer
                query = Q(title__icontains=request.query_params.get("search", "")[:200])
            else:
                if not is_admin(user):
                    raise PermissionDenied("Only administrators can access billing.")
                records = Contract.objects.select_related("client") if resource == "contracts" else Invoice.objects.select_related("contract__client")
                serializer = ContractSerializer if resource == "contracts" else InvoiceSerializer
                query = Q(reference__icontains=request.query_params.get("search", "")[:200])
            paginator = ClientPagination()
            page = paginator.paginate_queryset(records.filter(query), request)
            return paginator.get_paginated_response(serializer(page, many=True).data)
        if resource in ("attendance", "reports"):
            records = Shift.objects.filter(site__in=scope).select_related("guard", "site__client", "attendance").order_by("-starts_at", "-id")
            term = request.query_params.get("search", "")[:200]
            records = records.filter(Q(guard__username__icontains=term) | Q(guard__first_name__icontains=term) | Q(guard__last_name__icontains=term) | Q(site__name__icontains=term) | Q(site__client__name__icontains=term))
            for key, lookup in (("from", "starts_at__date__gte"), ("to", "starts_at__date__lte")):
                if request.query_params.get(key):
                    date = serializers.DateField().run_validation(request.query_params[key])
                    records = records.filter(**{lookup: date})
            paginator = ClientPagination()
            page = paginator.paginate_queryset(records, request)
            now = timezone.now()
            rows = []
            for shift in page:
                a = getattr(shift, "attendance", None)
                status = "cancelled" if shift.status == "cancelled" else "completed" if a and a.clocked_out_at else "clocked_in" if a and now < shift.ends_at else "clock_out_missing" if a else "absent" if now >= shift.ends_at else "not_clocked_in" if now >= shift.starts_at else "scheduled"
                rows.append({"id": shift.id, "guard_name": str(shift.guard), "site_name": shift.site.name, "client_name": shift.site.client.name, "starts_at": shift.starts_at, "ends_at": shift.ends_at, "status": status, "clocked_in_at": a.clocked_in_at if a else None, "clocked_out_at": a.clocked_out_at if a else None, "clock_out_gps_verified": a.clock_out_gps is not None if a and a.clocked_out_at else None, "clock_out_note": a.clock_out_note if a else "", "late_minutes": max(0, int((a.clocked_in_at - shift.starts_at).total_seconds() // 60)) if a else None})
            return paginator.get_paginated_response(rows)
        raise ValidationError("Unknown resource.")

    def post(self, request, resource):
        if resource not in ("entries", "contracts", "invoices"):
            raise PermissionDenied("This resource is read-only.")
        if resource != "entries" and not is_admin(request.user):
            raise PermissionDenied("Only administrators can manage billing.")
        cls = {"entries": EntrySerializer, "contracts": ContractSerializer, "invoices": InvoiceSerializer}[resource]
        serializer = cls(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(**({"created_by": request.user} if resource == "entries" else {}))
        return Response(serializer.data, status=201)

    @transaction.atomic
    def patch(self, request, resource):
        pk = serializers.IntegerField(min_value=1).run_validation(request.query_params.get("id"))
        if resource == "entries":
            item = get_object_or_404(OperationsEntry.objects.select_for_update().filter(site__in=sites_for(request.user)), pk=pk)
            if request.data != {"status": "resolved"}:
                raise ValidationError("Only resolving an entry is supported.")
            if item.status != "resolved":
                item.status, item.resolved_at, item.resolved_by = "resolved", timezone.now(), request.user
                item.save(update_fields=["status", "resolved_at", "resolved_by"])
            return Response(EntrySerializer(item).data)
        if resource == "invoices" and is_admin(request.user):
            item = get_object_or_404(Invoice.objects.select_for_update(), pk=pk)
            if request.data != {"status": "paid"}:
                raise ValidationError("Only recording payment is supported.")
            if not item.paid_at:
                item.paid_at, item.paid_by = timezone.now(), request.user
                item.save(update_fields=["paid_at", "paid_by"])
            return Response(InvoiceSerializer(item).data)
        raise PermissionDenied("This action is not allowed.")

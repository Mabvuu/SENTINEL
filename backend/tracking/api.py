from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from operations.models import Site, Shift
from .gps import GPSValidationError
from .models import Attendance
from .services import AttendanceError, clock_in, clock_out


class IsGuard(BasePermission):
    message = "An active guard account is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user.is_authenticated
            and user.is_active
            and user.role == "guard"
            and not user.is_superuser
        )


class PrivateAPIView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(
            request, response, *args, **kwargs
        )
        response["Cache-Control"] = "no-store"
        return response


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = (
            "id", "name", "address", "latitude", "longitude",
            "radius_metres", "max_accuracy_metres",
        )


class AttendanceSerializer(serializers.ModelSerializer):
    clock_out_gps_verified = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = (
            "id", "shift", "clocked_in_at", "clocked_out_at",
            "clock_out_gps_verified", "clock_out_note",
        )
        read_only_fields = fields

    def get_clock_out_gps_verified(self, obj):
        return obj.clock_out_gps is not None


class ShiftSerializer(serializers.ModelSerializer):
    site = SiteSerializer(read_only=True)
    attendance = AttendanceSerializer(read_only=True)

    class Meta:
        model = Shift
        fields = (
            "id", "site", "starts_at", "ends_at",
            "status", "notes", "attendance",
        )


class ShiftPagination(PageNumberPagination):
    page_size = 50


class MyShiftsView(ListAPIView):
    permission_classes = [IsAuthenticated, IsGuard]
    serializer_class = ShiftSerializer
    pagination_class = ShiftPagination

    def get_queryset(self):
        return Shift.objects.filter(
            guard=self.request.user
        ).select_related("site", "attendance").order_by("-starts_at")

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(
            request, response, *args, **kwargs
        )
        response["Cache-Control"] = "no-store"
        return response


class ClockInInput(serializers.Serializer):
    gps = serializers.JSONField()


class ClockOutInput(serializers.Serializer):
    gps = serializers.JSONField(required=False, allow_null=True)
    note = serializers.CharField(
        required=False, allow_blank=True, max_length=500, default=""
    )


class ClockInView(PrivateAPIView):
    permission_classes = [IsAuthenticated, IsGuard]

    def post(self, request, shift_id):
        data = ClockInInput(data=request.data)
        data.is_valid(raise_exception=True)

        try:
            attendance = clock_in(
                request.user, shift_id, data.validated_data["gps"]
            )
        except (AttendanceError, GPSValidationError) as error:
            raise ValidationError({"detail": str(error)})

        return Response(AttendanceSerializer(attendance).data, status=201)


class ClockOutView(PrivateAPIView):
    permission_classes = [IsAuthenticated, IsGuard]

    def post(self, request, shift_id):
        data = ClockOutInput(data=request.data)
        data.is_valid(raise_exception=True)

        try:
            attendance = clock_out(
                request.user,
                shift_id,
                gps=data.validated_data.get("gps"),
                note=data.validated_data["note"],
            )
        except (AttendanceError, GPSValidationError) as error:
            raise ValidationError({"detail": str(error)})

        return Response(AttendanceSerializer(attendance).data)


from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as ModelValidationError
from django.db import transaction
from rest_framework import generics, serializers
from rest_framework.filters import SearchFilter

from operations.client_api import ClientAccessMixin, ClientPagination
from operations.models import Shift, Site


class RosterSerializer(serializers.ModelSerializer):
    guard = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.filter(
            role="guard", is_active=True, is_superuser=False
        )
    )
    site = serializers.PrimaryKeyRelatedField(
        queryset=Site.objects.filter(is_active=True, client__is_active=True)
    )
    guard_name = serializers.SerializerMethodField()
    site_name = serializers.CharField(source="site.name", read_only=True)
    client_name = serializers.CharField(source="site.client.name", read_only=True)

    class Meta:
        model = Shift
        fields = (
            "id", "guard", "guard_name", "site", "site_name", "client_name",
            "starts_at", "ends_at", "status", "notes",
        )
        read_only_fields = ("id", "status")
        extra_kwargs = {
            "notes": {"required": False, "allow_blank": True, "max_length": 4000}
        }

    def get_guard_name(self, obj):
        return obj.guard.get_full_name() or obj.guard.username

    def validate(self, data):
        if data["ends_at"] <= data["starts_at"]:
            raise serializers.ValidationError({
                "detail": "The shift must end after it starts."
            })
        return data

    def create(self, validated_data):
        # Serialize assignments for the same guard through this endpoint.
        with transaction.atomic():
            guard = get_user_model().objects.select_for_update().get(
                pk=validated_data["guard"].pk
            )
            shift = Shift(
                **{**validated_data, "guard": guard},
                status=Shift.Status.SCHEDULED,
            )
            try:
                shift.full_clean()
            except ModelValidationError as error:
                raise serializers.ValidationError({
                    "detail": " ".join(error.messages)
                })
            shift.save()
            return shift


class RosterView(ClientAccessMixin, generics.ListCreateAPIView):
    serializer_class = RosterSerializer
    pagination_class = ClientPagination
    queryset = Shift.objects.select_related(
        "guard", "site", "site__client"
    ).order_by("-starts_at", "-id")
    filter_backends = (SearchFilter,)
    search_fields = (
        "guard__username", "guard__first_name", "guard__last_name",
        "site__name", "site__client__name",
    )
    http_method_names = ("get", "post", "head", "options")

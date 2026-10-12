from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import generics, serializers
from rest_framework.filters import SearchFilter

from operations.client_api import ClientAccessMixin, ClientPagination
from operations.models import Client, Site


class SiteSerializer(serializers.ModelSerializer):
    client = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all()
    )
    client_name = serializers.CharField(
        source="client.name", read_only=True
    )
    supervisors = serializers.PrimaryKeyRelatedField(
        many=True,
        required=False,
        queryset=get_user_model().objects.filter(
            role="supervisor", is_active=True
        ),
    )
    address = serializers.CharField(max_length=4000)

    class Meta:
        model = Site
        fields = (
            "id",
            "client",
            "client_name",
            "name",
            "address",
            "latitude",
            "longitude",
            "radius_metres",
            "max_accuracy_metres",
            "required_guards",
            "supervisors",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "client_name", "created_at")

    def validate(self, attrs):
        instance = self.instance

        if instance is not None:
            client = attrs.get("client", instance.client)
            if client.pk != instance.client_id:
                raise serializers.ValidationError({
                    "client": (
                        "An existing site cannot be moved to another client. "
                        "Create a new site instead."
                    )
                })
        else:
            client = attrs.get("client")

        active = attrs.get(
            "is_active",
            instance.is_active if instance is not None else True,
        )

        if active and client is not None and not client.is_active:
            raise serializers.ValidationError({
                "client": "Restore the client before activating this site."
            })

        candidate = Site()
        if instance is not None:
            for field in Site._meta.concrete_fields:
                setattr(
                    candidate,
                    field.attname,
                    getattr(instance, field.attname),
                )
            candidate._state.adding = False
            candidate._state.db = instance._state.db

        for key, value in attrs.items():
            if key != "supervisors":
                setattr(candidate, key, value)

        try:
            candidate.full_clean(exclude=["supervisors"])
        except DjangoValidationError as error:
            details = (
                error.message_dict
                if hasattr(error, "message_dict")
                else {"non_field_errors": error.messages}
            )
            if "__all__" in details:
                details["non_field_errors"] = details.pop("__all__")
            raise serializers.ValidationError(details)

        return attrs

    def create(self, validated_data):
        try:
            with transaction.atomic():
                return super().create(validated_data)
        except IntegrityError:
            raise serializers.ValidationError({
                "detail": (
                    "The site could not be saved. Check its values "
                    "and whether this client already has that site name."
                )
            })

    def update(self, instance, validated_data):
        try:
            with transaction.atomic():
                return super().update(instance, validated_data)
        except IntegrityError:
            raise serializers.ValidationError({
                "detail": (
                    "The site could not be saved. Check its values "
                    "and whether this client already has that site name."
                )
            })


class SiteAccessMixin(ClientAccessMixin):
    serializer_class = SiteSerializer
    queryset = (
        Site.objects
        .select_related("client")
        .prefetch_related("supervisors")
        .order_by("client__name", "name", "id")
    )


class SiteListCreateView(
    SiteAccessMixin, generics.ListCreateAPIView
):
    pagination_class = ClientPagination
    filter_backends = (SearchFilter,)
    search_fields = ("name", "address", "client__name")


class SiteDetailView(
    SiteAccessMixin, generics.RetrieveUpdateAPIView
):
    # Archive instead of deleting historical records.
    http_method_names = ("get", "patch", "head", "options")

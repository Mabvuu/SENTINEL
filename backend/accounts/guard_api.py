from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import generics, serializers
from rest_framework.filters import SearchFilter

from operations.client_api import ClientAccessMixin, ClientPagination

User = get_user_model()


class GuardSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=False,
        trim_whitespace=False,
        min_length=8,
        max_length=128,
    )

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "phone",
        "employee_number",
        "national_id",
            "employee_number",
            "national_id",
            "training_status",
            "vetting_status",
            "employment_status",
            "training_notes",
            "vetting_notes",
            "is_active",
            "password",
        )
        read_only_fields = ("id",)

    def validate(self, attrs):
        if self.instance is None and "password" not in attrs:
            raise serializers.ValidationError({
                "password": "Enter a password for this guard."
            })

        if "password" in attrs:
            candidate = User()
            for field in ("username", "first_name", "last_name", "email"):
                default = (
                    getattr(self.instance, field, "")
                    if self.instance is not None else ""
                )
                setattr(candidate, field, attrs.get(field, default))

            try:
                validate_password(attrs["password"], user=candidate)
            except DjangoValidationError as error:
                raise serializers.ValidationError({
                    "password": error.messages
                })

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        try:
            with transaction.atomic():
                guard = User(
                    **validated_data,
                    role="guard",
                    is_staff=False,
                    is_superuser=False,
                )
                guard.set_password(password)
                guard.save()
                return guard
        except IntegrityError:
            raise serializers.ValidationError({
                "detail": (
                    "This account could not be created. "
                    "Check whether its username is already in use."
                )
            })

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)

        try:
            with transaction.atomic():
                guard = (
                    User.objects.select_for_update()
                    .filter(
                        pk=instance.pk,
                        role="guard",
                        is_staff=False,
                        is_superuser=False,
                    )
                    .first()
                )
                if guard is None:
                    raise serializers.ValidationError({
                        "detail": "This account is no longer a guard account."
                    })

                for key, value in validated_data.items():
                    setattr(guard, key, value)

                if password is not None:
                    guard.set_password(password)

                guard.save()
                return guard
        except IntegrityError:
            raise serializers.ValidationError({
                "detail": (
                    "This account could not be saved. "
                    "Check whether its username is already in use."
                )
            })


class GuardAccessMixin(ClientAccessMixin):
    serializer_class = GuardSerializer
    queryset = User.objects.filter(
        role="guard",
        is_staff=False,
        is_superuser=False,
    ).order_by("first_name", "last_name", "username", "id")


class GuardListCreateView(
    GuardAccessMixin, generics.ListCreateAPIView
):
    pagination_class = ClientPagination
    filter_backends = (SearchFilter,)
    search_fields = (
        "username",
        "first_name",
        "last_name",
        "email",
        "phone",
    )


class GuardDetailView(
    GuardAccessMixin, generics.RetrieveUpdateAPIView
):
    # Disable accounts instead of deleting attendance history.
    http_method_names = ("get", "patch", "head", "options")

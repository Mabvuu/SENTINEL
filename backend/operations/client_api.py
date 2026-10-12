from rest_framework import generics, permissions, serializers
from rest_framework.filters import SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.authentication import JWTAuthentication

from operations.models import Client


class IsSentinelAdmin(permissions.BasePermission):
    message = "Only administrators can manage clients."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and (
                user.is_superuser
                or getattr(user, "role", None) == "admin"
            )
        )


class ClientSerializer(serializers.ModelSerializer):
    address = serializers.CharField(
        required=False, allow_blank=True, max_length=4000
    )

    class Meta:
        model = Client
        fields = (
            "id",
            "name",
            "contact_name",
            "email",
            "phone",
            "address",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Enter the client's name."
            )
        return value


class ClientPagination(PageNumberPagination):
    page_size = 50


class ClientAccessMixin:
    authentication_classes = (JWTAuthentication,)
    permission_classes = (
        permissions.IsAuthenticated,
        IsSentinelAdmin,
    )
    serializer_class = ClientSerializer
    queryset = Client.objects.order_by("name", "id")

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(
            request, response, *args, **kwargs
        )
        response["Cache-Control"] = "no-store"
        return response


class ClientListCreateView(
    ClientAccessMixin, generics.ListCreateAPIView
):
    pagination_class = ClientPagination
    filter_backends = (SearchFilter,)
    search_fields = ("name", "contact_name", "email", "phone")


class ClientDetailView(
    ClientAccessMixin, generics.RetrieveUpdateAPIView
):
    # Archive with PATCH {"is_active": false}.
    http_method_names = ("get", "patch", "head", "options")

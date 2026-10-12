from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenBlacklistView,
)


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class TokenThrottle(AnonRateThrottle):
    scope = "token"


class LoginView(TokenObtainPairView):
    throttle_classes = [LoginThrottle]


class RefreshView(TokenRefreshView):
    throttle_classes = [TokenThrottle]


class LogoutView(TokenBlacklistView):
    throttle_classes = [TokenThrottle]


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        response = Response({
            "id": user.pk,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": "admin" if user.is_superuser else user.role,
        })
        response["Cache-Control"] = "no-store"
        return response

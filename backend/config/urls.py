from django.contrib import admin
from django.http import JsonResponse
from django.urls import path


def health(request):
    return JsonResponse({"status": "ok", "service": "sentinel-api"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
]


from django.urls import include

urlpatterns += [
    path("api/", include("tracking.urls")),
]

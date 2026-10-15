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

from django.urls import path as sentinel_module_path
from operations.console_api import ConsoleView
urlpatterns += [sentinel_module_path("api/console/<str:resource>/", ConsoleView.as_view())]

from django.urls import path as patrol_path
from tracking.patrol_api import PatrolView, AddressSearchView
urlpatterns += [patrol_path("api/patrol/history/", PatrolView.as_view()), patrol_path("api/patrol/address/", AddressSearchView.as_view())]

from tracking.round_api import AdminRounds, GuardRounds
urlpatterns += [path('api/rounds/mine/', GuardRounds.as_view()), path('api/rounds/<str:resource>/', AdminRounds.as_view())]

# Sentinel roster URL repair
from django.urls import path as roster_path
from operations.roster_api import RosterView
urlpatterns = [roster_path("api/management/assignments/", RosterView.as_view())] + urlpatterns

# Sentinel duty upgrade endpoints
from django.urls import path as duty_path
from tracking.duty_api import GuardDuty, AdminDuty
urlpatterns += [duty_path("api/duty/mine/", GuardDuty.as_view()), duty_path("api/duty/admin/", AdminDuty.as_view())]

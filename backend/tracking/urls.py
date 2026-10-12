from django.urls import path
from accounts.api import LoginView, RefreshView, LogoutView, MeView
from .api import MyShiftsView, ClockInView, ClockOutView

urlpatterns = [
    path("auth/login/", LoginView.as_view()),
    path("auth/refresh/", RefreshView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("shifts/mine/", MyShiftsView.as_view()),
    path("shifts/<int:shift_id>/clock-in/", ClockInView.as_view()),
    path("shifts/<int:shift_id>/clock-out/", ClockOutView.as_view()),
]


from .location_api import LocationUpdateView

urlpatterns += [
    path("shifts/<int:shift_id>/location/", LocationUpdateView.as_view()),
]


from .control_room import ControlRoomLocationsView

urlpatterns += [
    path("control-room/locations/", ControlRoomLocationsView.as_view()),
]

# Sentinel client management routes
from operations.client_urls import urlpatterns as client_management_urls

urlpatterns += client_management_urls

# Sentinel site management routes
from operations.site_urls import urlpatterns as site_management_urls

urlpatterns += site_management_urls

# Sentinel guard management routes
from accounts.guard_urls import urlpatterns as guard_management_urls

urlpatterns += guard_management_urls

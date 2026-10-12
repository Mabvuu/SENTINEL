from django.urls import path

from accounts.guard_api import (
    GuardDetailView,
    GuardListCreateView,
)

urlpatterns = [
    path(
        "management/guards/",
        GuardListCreateView.as_view(),
        name="management-guard-list",
    ),
    path(
        "management/guards/<int:pk>/",
        GuardDetailView.as_view(),
        name="management-guard-detail",
    ),
]

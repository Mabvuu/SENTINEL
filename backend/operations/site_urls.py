from django.urls import path

from operations.site_api import (
    SiteDetailView,
    SiteListCreateView,
)

urlpatterns = [
    path(
        "management/sites/",
        SiteListCreateView.as_view(),
        name="management-site-list",
    ),
    path(
        "management/sites/<int:pk>/",
        SiteDetailView.as_view(),
        name="management-site-detail",
    ),
]

from django.urls import path

from operations.client_api import (
    ClientDetailView,
    ClientListCreateView,
)

urlpatterns = [
    path(
        "management/clients/",
        ClientListCreateView.as_view(),
        name="management-client-list",
    ),
    path(
        "management/clients/<int:pk>/",
        ClientDetailView.as_view(),
        name="management-client-detail",
    ),
]

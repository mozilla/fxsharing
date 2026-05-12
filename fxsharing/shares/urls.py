from django.urls import path, re_path

from . import views

urlpatterns = [
    path("", views.shares, name="shares"),
    path("api/v1/create", views.create_share, name="create_share"),
    path("api/v1/report", views.report_share, name="report_share"),
    path("api/v1/share/<str:shortcode>", views.api_share, name="api_share"),
    path("auth-complete", views.auth_complete, name="auth_complete"),
    re_path(r"^s/(?P<shortcode>[A-Za-z0-9]{10})$", views.view_share, name="view_share"),
]

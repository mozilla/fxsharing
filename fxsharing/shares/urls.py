from django.conf import settings
from django.urls import path

from . import views

urlpatterns = [
    path("", views.landing, name="landing"),
    path("api/v1/create", views.create_share, name="create_share"),
    path("report/<str:shortcode>", views.report_share, name="report_share"),
    path("auth-complete", views.auth_complete, name="auth_complete"),
]

if settings.DEBUG:
    urlpatterns += [
        path("shares", views.shares, name="shares"),
        path("dev-login", views.dev_login, name="dev_login"),
        path("debug/404", views.page_not_found, {"exception": None}, name="debug_404"),
        path("debug/500", views.server_error, name="debug_500"),
    ]

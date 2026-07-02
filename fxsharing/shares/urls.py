from django.conf import settings
from django.urls import path

from . import views

urlpatterns = [
    path("", views.landing, name="landing"),
    path("api/v1/create", views.create_share, name="create_share"),
    path("api/v1/ts_response", views.ts_webhook, name="ts_webhook"),
    path("event", views.record_client_event, name="record_client_event"),
    path("report/<str:shortcode>", views.report_share, name="report_share"),
    path("auth-complete", views.auth_complete, name="auth_complete"),
    path("get_favicon_url", views.get_favicon_url, name="get_favicon_url"),
]

if settings.DEBUG:
    urlpatterns += [
        path("dev-login", views.dev_login, name="dev_login"),
        path("debug/404", views.page_not_found, {"exception": None}, name="debug_404"),
        path("debug/500", views.server_error, name="debug_500"),
    ]

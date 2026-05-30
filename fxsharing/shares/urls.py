from django.conf import settings
from django.urls import path

from . import views

urlpatterns = [
    path("", views.landing, name="landing"),
    path("api/v1/create", views.create_share, name="create_share"),
    path("api/v1/ts_response", views.ts_webhook, name="ts_webhook"),
    path("report/<str:shortcode>", views.report_share, name="report_share"),
    path("auth-complete", views.auth_complete, name="auth_complete"),
]

if settings.DEBUG:
    urlpatterns += [
        path("shares", views.shares, name="shares"),
    ]

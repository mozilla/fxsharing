from django.urls import path

from . import views

urlpatterns = [
    path("", views.shares, name="shares"),
    path("api/v1/create", views.create_share, name="create_share"),
    path("report/<str:shortcode>", views.report_share, name="report_share"),
    path("auth-complete", views.auth_complete, name="auth_complete"),
]

from django.urls import path

from . import views

urlpatterns = [
    path("", views.shares, name="shares"),
    path("create_share", views.create_share, name="create_share"),
    path("<uuid:share_id>", views.view_share, name="view_share"),
]

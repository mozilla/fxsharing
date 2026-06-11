"""
URL configuration for fxsharing project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import include, path, re_path

from fxsharing.shares import views as shares_views

handler404 = "fxsharing.shares.views.page_not_found"
handler500 = "fxsharing.shares.views.server_error"

urlpatterns = [
    path("", include("fxsharing.shares.urls")),
    re_path(
        r"^(?P<shortcode>[A-Za-z0-9]{10})$",
        shares_views.view_share,
        name="view_share",
    ),
    # Curated subset of django-allauth routes — see fxsharing/users/urls.py.
    path("accounts/", include("fxsharing.users.urls")),
    path("admin/", admin.site.urls),
    re_path(r"^.*$", shares_views.page_not_found, {"exception": None}),
]

"""Curated django-allauth URL configuration.

``allauth.urls`` mounts ~13 endpoints (login/logout/signup/inactive/connections
plus legacy ``social/*`` redirects). This app only authenticates via Firefox
Accounts OAuth, so we expose just the handful of endpoints that flow actually
uses:

* the FxA provider login + callback, and
* the social login cancelled/error/signup pages, which allauth renders (and
  ``reverse()``-es) as part of the OAuth flow.

The remaining endpoints are intentionally not exposed. We still register their
URL *names* — pointed at a 404 handler — because allauth reverses some of them
internally during the OAuth flow (``account_login`` as the default
``LOGIN_URL``, ``account_inactive`` for inactive users). Registering the names
keeps ``reverse()`` working while ensuring the endpoints themselves are not
reachable.

See bug 2036462.
"""

from django.http import Http404
from django.urls import path

from allauth.socialaccount import views as socialaccount_views
from allauth.socialaccount.providers.fxa.urls import urlpatterns as fxa_urlpatterns


def disabled(request, *args, **kwargs):
    """Stand-in for allauth endpoints we don't support; always 404s.

    The URL name is kept registered so allauth's internal ``reverse()`` calls
    keep working, but the endpoint returns 404 rather than rendering an
    allauth-managed page.
    """
    raise Http404


# Endpoints we expose. ``fxa_urlpatterns`` provides ``fxa/login/`` (fxa_login)
# and ``fxa/login/callback/`` (fxa_callback).
urlpatterns = [
    *fxa_urlpatterns,
    # Part of the OAuth flow: shown when the user cancels or errors out at FxA,
    # and reversed internally by allauth (e.g. on a signup edge case).
    path(
        "3rdparty/login/cancelled/",
        socialaccount_views.login_cancelled,
        name="socialaccount_login_cancelled",
    ),
    path(
        "3rdparty/login/error/",
        socialaccount_views.login_error,
        name="socialaccount_login_error",
    ),
    path(
        "3rdparty/signup/",
        socialaccount_views.signup,
        name="socialaccount_signup",
    ),
    # Endpoints we don't support. Names kept registered (allauth reverses some
    # of these internally) but the routes 404.
    path("login/", disabled, name="account_login"),
    path("logout/", disabled, name="account_logout"),
    path("inactive/", disabled, name="account_inactive"),
    path("3rdparty/", disabled, name="socialaccount_connections"),
]

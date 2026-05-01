from datetime import timedelta

from django.conf import settings
from django.utils import timezone


class OAuthLoginCompleteCookieMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        expires = timezone.now() + timedelta(days=365)

        if getattr(request, "_fxsharing_logged_in", False):
            response.set_cookie(
                "auth",
                "1",
                expires=expires,
                secure=not settings.DEBUG,
                httponly=True,
                samesite="Lax",
                path="/",
            )

        if getattr(request, "_fxsharing_logged_out", False):
            response.delete_cookie(
                "auth",
                samesite="Lax",
                path="/",
            )

        return response

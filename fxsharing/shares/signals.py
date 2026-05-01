from allauth.account.signals import user_logged_in, user_logged_out
from django.dispatch import receiver

@receiver(user_logged_in)
def mark_logged_in(request, user, **kwargs):
    request._fxsharing_logged_in = True

@receiver(user_logged_out)
def mark_logged_out(request, user, **kwargs):
    request._fxsharing_logged_out = True

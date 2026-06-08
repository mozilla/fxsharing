from allauth.socialaccount.adapter import DefaultSocialAccountAdapter


class FxASocialAccountAdapter(DefaultSocialAccountAdapter):
    def populate_user(self, request, sociallogin, _data):
        user = super().populate_user(request, sociallogin, _data)
        user.fxa_id = sociallogin.account.uid
        return user


def user_display(user):
    """Resolve how a user is shown to themselves, e.g. the post-login banner.

    Wired up via the ``ACCOUNT_USER_DISPLAY`` setting and used by allauth's
    ``{% user_display %}`` template tag. The FxA email lives in the social
    account's stored profile (``extra_data``); fall back to ``fxa_id`` when it
    is unavailable (e.g. dev seed users with no social account).
    """
    account = user.socialaccount_set.filter(provider="fxa").first()
    if account:
        email = account.extra_data.get("email")
        if email:
            return email
    return user.fxa_id

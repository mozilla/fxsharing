from allauth.socialaccount.adapter import DefaultSocialAccountAdapter


class FxASocialAccountAdapter(DefaultSocialAccountAdapter):
    def populate_user(self, request, sociallogin, _data):
        user = super().populate_user(request, sociallogin, _data)
        user.fxa_id = sociallogin.account.uid
        return user

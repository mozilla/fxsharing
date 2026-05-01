from django.apps import AppConfig


class SharesConfig(AppConfig):
    name = "fxsharing.shares"

    def ready(self):
        import fxsharing.shares.signals

import pytest


@pytest.fixture(autouse=True)
def _manifest_free_static(settings):
    """Use a manifest-free static backend in tests.

    Production uses ``CompressedManifestStaticFilesStorage`` (see settings.py),
    whose manifest only exists after ``collectstatic``. Tests skip that step, so
    template ``{% static %}`` lookups would otherwise fail.
    """
    settings.STORAGES = {
        **settings.STORAGES,
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }

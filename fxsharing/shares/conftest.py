from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def mock_celery_tasks():
    with (
        patch("fxsharing.shares.views.process_new_share", autospec=True),
        patch("fxsharing.shares.views.submit_share_to_cinder", autospec=True),
        patch("fxsharing.shares.views.purge_cdn_cache", autospec=True),
    ):
        yield

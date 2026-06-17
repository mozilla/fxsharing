from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def mock_celery_tasks():
    with (
        patch("fxsharing.shares.views.fetch_link_preview", autospec=True),
        patch("fxsharing.shares.views.submit_link_to_cinder", autospec=True),
    ):
        yield

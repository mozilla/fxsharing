from django.conf import settings


def analytics(request):
    """Expose the Google Analytics measurement ID to all templates.

    Empty unless configured (see settings.GA_MEASUREMENT_ID), so base.html
    omits the gtag snippet entirely in local dev.
    """
    return {"ga_measurement_id": settings.GA_MEASUREMENT_ID}

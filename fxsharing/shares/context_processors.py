from django.conf import settings


def analytics(request):
    """Expose the Google Analytics measurement ID to all templates.

    Empty unless configured (see settings.GA_MEASUREMENT_ID), so base.html
    omits the gtag snippet entirely in local dev.
    """
    return {"ga_measurement_id": settings.GA_MEASUREMENT_ID}


def nova(request):
    """Expose whether to render the page in Firefox's Nova design language.

    Off until Nova ships (see settings.NOVA_ENABLED). `?nova=1` / `?nova=0`
    overrides the default for a single request so the refresh can be reviewed on
    staging without changing what everyone else sees.
    """
    override = request.GET.get("nova")
    if override in ("0", "1"):
        return {"nova_enabled": override == "1"}
    return {"nova_enabled": settings.NOVA_ENABLED}

"""JSON Schema for FxA relying-party Security Event Tokens (SETs).

Validates the decoded token envelope only; the signature, issuer, audience and
expiry are checked cryptographically by ``jwt.decode`` before this runs.
"""

set_envelope_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "FxA Security Event Token",
    "type": "object",
    "version": "1.0.0",
    "required": ["iss", "sub", "aud", "iat", "jti", "events"],
    "properties": {
        "iss": {"type": "string", "minLength": 1},
        "sub": {"type": "string", "minLength": 1},
        "aud": {"type": ["string", "array"]},
        "iat": {"type": "number"},
        "jti": {"type": "string", "minLength": 1},
        "events": {"type": "object", "minProperties": 1},
    },
}

EVENT_DELETE_USER = "https://schemas.accounts.firefox.com/event/delete-user"
EVENT_PASSWORD_CHANGE = "https://schemas.accounts.firefox.com/event/password-change"  # noqa: S105
EVENT_PROFILE_CHANGE = "https://schemas.accounts.firefox.com/event/profile-change"
EVENT_SUBSCRIPTION_STATE_CHANGE = (
    "https://schemas.accounts.firefox.com/event/subscription-state-change"
)
EVENT_METRICS_OPT_OUT = "https://schemas.accounts.firefox.com/event/metrics-opt-out"
EVENT_METRICS_OPT_IN = "https://schemas.accounts.firefox.com/event/metrics-opt-in"

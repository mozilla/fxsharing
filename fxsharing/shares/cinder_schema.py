"""JSON Schemas for the Cinder ``link_sharing_quality`` integration."""

workflow_event_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Cinder Workflow Event (link_sharing_quality)",
    "description": (
        "Payload for POST /api/v2/workflows/event for the "
        "link_sharing_quality workflow. One event per submitted URL."
    ),
    "type": "object",
    "version": "1.0.0",
    "required": ["event_name", "entity"],
    "properties": {
        "event_name": {"const": "link_sharing_quality"},
        "entity": {
            "type": "object",
            "required": ["entity_schema", "attributes"],
            "properties": {
                "entity_schema": {"const": "fxsharing_url"},
                "attributes": {
                    "type": "object",
                    "required": ["id", "url"],
                    "properties": {
                        "id": {"type": "string", "minLength": 1},
                        "url": {"type": "string", "minLength": 1},
                        "title": {"type": "string"},
                        "metadata": {"type": "object"},
                    },
                },
            },
        },
        "subgraph": {
            "type": "object",
            "properties": {
                "entities": {"type": "array"},
                "relationships": {"type": "array"},
            },
        },
    },
}


decision_created_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Cinder decision.created Webhook",
    "description": (
        "Payload Cinder POSTs to ts_webhook when the link_sharing_quality "
        "workflow creates a decision for a URL. Only the fields the app reads "
        "are validated; other fields are accepted but not inspected."
    ),
    "type": "object",
    "version": "1.0.0",
    "required": ["event", "payload"],
    "properties": {
        "event": {"const": "decision.created"},
        "payload": {
            "type": "object",
            "required": ["entity", "enforcement_actions"],
            "properties": {
                "entity": {
                    "type": "object",
                    "required": ["entity_schema", "attributes"],
                    "properties": {
                        "entity_schema": {"type": "string"},
                        "attributes": {
                            "type": "object",
                            "required": ["id"],
                            "properties": {
                                "id": {"type": "string", "minLength": 1},
                            },
                        },
                    },
                },
                "enforcement_actions": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "policies": {"type": "array"},
            },
        },
    },
}


share_report_event_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Cinder Share Report Event",
    "description": (
        "Payload for POST /api/v2/workflows/event when a user reports an "
        "fxsharing share for abuse. One event per reported share."
    ),
    "type": "object",
    "version": "1.0.0",
    "required": ["event_name", "entity"],
    "properties": {
        "event_name": {"const": "link_collections_reporting"},
        "entity": {
            "type": "object",
            "required": ["entity_schema", "attributes"],
            "properties": {
                "entity_schema": {"const": "fxsharing"},
                "attributes": {
                    "type": "object",
                    "required": ["id", "shortcode", "title", "reason"],
                    "properties": {
                        "id": {"type": "string", "minLength": 1},
                        "shortcode": {"type": "string", "minLength": 1},
                        "title": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                },
            },
        },
    },
}

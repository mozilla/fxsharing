share_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ShareForm",
    "description": "Schema for creating a shared collection of links.",
    "type": "object",
    "required": ["type", "fxa_id", "title", "links"],
    "additionalProperties": False,
    "properties": {
        "type": {"type": "string", "enum": ["tab_group", "bookmark_folder", "tabs"]},
        "fxa_id": {"type": "string"},
        "title": {"type": "string"},
        "links": {
            "type": "array",
            "minItems": 1,
            "items": {
                "oneOf": [{"$ref": "#/$defs/Link"}, {"$ref": "#/$defs/NestedShare"}]
            },
        },
    },
    "$defs": {
        "Link": {
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": {"type": "string", "format": "uri"},
                "title": {"type": "string"},
            },
        },
        "NestedShare": {
            "type": "object",
            "required": ["type", "title", "links"],
            "additionalProperties": False,
            "properties": {
                "type": {"type": "string", "const": "bookmark_folder"},
                "title": {"type": "string"},
                "links": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "oneOf": [
                            {"$ref": "#/$defs/Link"},
                            {"$ref": "#/$defs/NestedShare"},
                        ]
                    },
                },
            },
        },
    },
}

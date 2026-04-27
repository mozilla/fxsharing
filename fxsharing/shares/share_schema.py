share_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ShareForm",
    "description": "Schema for creating a shared collection of links.",
    "type": "object",
    "required": ["type", "title", "links"],
    "additionalProperties": False,
    "properties": {
        "type": {"type": "string", "enum": ["tab_group", "bookmarks", "tabs"]},
        "title": {"type": "string", "maxLength": 100},
        "links": {
            "type": "array",
            "minItems": 1,
            "maxItems": 30,
            "items": {
                "oneOf": [{"$ref": "#/$defs/Link"}, {"$ref": "#/$defs/Bookmark"}]
            },
        },
    },
    "$defs": {
        "Link": {
            "type": "object",
            "required": ["url", "title"],
            "additionalProperties": False,
            "properties": {
                "url": {
                    "type": "string",
                    "format": "uri",
                    "pattern": "^https?://.*$",
                    "maxLength": 4000,
                },
                "title": {"type": "string", "maxLength": 100},
            },
        },
        "Bookmark": {
            "type": "object",
            "required": ["type", "title", "links"],
            "additionalProperties": False,
            "properties": {
                "type": {"type": "string", "const": "bookmarks"},
                "title": {"type": "string", "maxLength": 100},
                "links": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 29,
                    "items": {
                        "oneOf": [
                            {"$ref": "#/$defs/Link"},
                            {"$ref": "#/$defs/Bookmark"},
                        ]
                    },
                },
            },
        },
    },
}

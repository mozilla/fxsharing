#!/usr/bin/env python3
"""
Generate static/styles/tokens-nova.css from mozilla-central's design tokens.

Nova is expressed in Firefox as design-token overrides gated behind
`@media -moz-pref("browser.nova.enabled")`. That media query only works in
browser chrome, and acorn-web's transform pipeline drops it, so share.firefox.com
can't pick Nova up from the vendored Acorn copy. This script lifts those blocks
out of mozilla-central and re-scopes them to `:root.nova`, which base.html sets
when the Nova preview is enabled.

Component-level token files (moz-promo.tokens.css and friends) declare their
tokens on `:host`. We re-scope those to `:root.nova <tag>` instead of patching
the vendored components: per CSS Scoping, a rule in the outer tree beats a
`:host` rule in the shadow tree, so the override lands without touching Acorn.

mozilla-central moves much faster than the vendored Acorn build, so a lot of the
Nova tokens refer to properties our components never read (browser chrome:
toolbox, toolbar, panel, sidebar, ...). Emitting those would be dead CSS — some
of it not even valid outside chrome — so declarations are filtered down to what
static/ actually references, plus whatever those transitively depend on.

    uv run python scripts/generate_nova_tokens.py
    uv run python scripts/generate_nova_tokens.py --firefox-root ~/code/firefox

Delete this script and its output once acorn-web knows how to emit Nova itself.
"""

import argparse
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
OUTPUT = STATIC / "styles" / "tokens-nova.css"

RAW_BASE = "https://raw.githubusercontent.com/mozilla-firefox/firefox/main/"

# Global token sheets. Their nova blocks apply to the whole page.
GLOBAL_SOURCES = [
    "toolkit/themes/shared/design-system/dist/tokens-shared.css",
    "toolkit/themes/shared/design-system/dist/tokens-brand.css",
]

# Per-component token sheets, scoped to the custom element. Only components we
# actually vendor are worth pulling in.
COMPONENT_SOURCE = "toolkit/content/widgets/{name}/{name}.tokens.css"
COMPONENTS = [
    "moz-badge",
    "moz-input-color",
    "moz-message-bar",
    "moz-page-nav",
    "moz-promo",
    "moz-select",
    "moz-toggle",
]

NOVA_MEDIA = '@media -moz-pref("browser.nova.enabled")'

# mozilla-central's full layer order. tokens-shared.css collapses
# browser-theme/brand into tokens-foundation, so those nova layers collapse too.
LAYER_FOUNDATION = "tokens-foundation-nova"
LAYER_CONTRAST = "tokens-prefers-contrast-nova"
LAYER_FORCED = "tokens-forced-colors-nova"
LAYER_ORDER = [LAYER_FOUNDATION, LAYER_CONTRAST, LAYER_FORCED]

LAYER_ALIASES = {
    "tokens-foundation-nova": LAYER_FOUNDATION,
    "tokens-browser-theme-nova": LAYER_FOUNDATION,
    "tokens-foundation-brand-nova": LAYER_FOUNDATION,
    "tokens-prefers-contrast-nova": LAYER_CONTRAST,
    "tokens-forced-colors-nova": LAYER_FORCED,
}

DECL_RE = re.compile(r"(--[\w-]+)\s*:\s*([^;]+);")
VAR_RE = re.compile(r"var\(\s*(--[\w-]+)")


def read_source(path: str, firefox_root: Path | None) -> str:
    if firefox_root:
        local = firefox_root / path
        if not local.is_file():
            sys.exit(f"{local} not found in the Firefox checkout")
        return local.read_text()
    with urllib.request.urlopen(RAW_BASE + path) as response:  # noqa: S310 - fixed https base
        return response.read().decode()


def match_block(text: str, open_index: int) -> tuple[str, int]:
    """Return the body of the {...} starting at open_index, and the index after it."""
    depth = 0
    for i in range(open_index, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[open_index + 1 : i], i + 1
    raise ValueError("unbalanced braces")


def find_blocks(text: str, prelude: str) -> list[str]:
    """Bodies of every `<prelude> { ... }` in text."""
    bodies = []
    start = 0
    while True:
        found = text.find(prelude, start)
        if found == -1:
            return bodies
        brace = text.find("{", found + len(prelude))
        body, end = match_block(text, brace)
        bodies.append(body)
        start = end


def parse_nova(source: str) -> dict[str, list[tuple[str, str]]]:
    """Map our layer names -> [(property, value)] for one token sheet."""
    layers: dict[str, list[tuple[str, str]]] = {name: [] for name in LAYER_ORDER}
    for nova_body in find_blocks(source, NOVA_MEDIA):
        for match in re.finditer(r"@layer\s+([\w-]+)\s*\{", nova_body):
            name = match.group(1)
            if name not in LAYER_ALIASES:
                print(f"  warning: unexpected nova layer {name!r}, skipping")
                continue
            body, _ = match_block(nova_body, match.end() - 1)
            layers[LAYER_ALIASES[name]] += DECL_RE.findall(body)
    return {name: decls for name, decls in layers.items() if decls}


def referenced_properties() -> set[str]:
    """Every custom property static/ reads via var(), i.e. what Nova can affect."""
    used: set[str] = set()
    for sub in ("components", "dependencies", "styles"):
        for path in (STATIC / sub).rglob("*"):
            if path.suffix in (".mjs", ".css") and path != OUTPUT:
                used |= set(VAR_RE.findall(path.read_text()))
    return used


def filter_declarations(
    layers: dict[str, list[tuple[str, str]]], used: set[str]
) -> dict[str, list[tuple[str, str]]]:
    """Keep declarations static/ reads, plus everything they transitively need."""
    wanted = set(used)
    while True:
        pulled_in = set()
        for decls in layers.values():
            for prop, value in decls:
                if prop in wanted:
                    pulled_in |= set(VAR_RE.findall(value)) - wanted
        if not pulled_in:
            break
        wanted |= pulled_in

    return {
        name: [(prop, value) for prop, value in decls if prop in wanted]
        for name, decls in layers.items()
    }


def render_rule(selector: str, decls: list[tuple[str, str]], indent: str) -> str:
    lines = [f"{indent}{selector} {{"]
    lines += [f"{indent}  {prop}: {value.strip()};" for prop, value in decls]
    lines.append(f"{indent}}}")
    return "\n".join(lines)


def render(sections: list[tuple[str, dict[str, list[tuple[str, str]]]]]) -> str:
    wrappers = {
        LAYER_CONTRAST: "@media (prefers-contrast)",
        LAYER_FORCED: "@media (forced-colors)",
    }

    out = [
        "/* This Source Code Form is subject to the terms of the Mozilla Public",
        " * License, v. 2.0. If a copy of the MPL was not distributed with this",
        " * file, You can obtain one at http://mozilla.org/MPL/2.0/. */",
        "",
        "/* DO NOT EDIT — generated by scripts/generate_nova_tokens.py from the",
        ' * `@media -moz-pref("browser.nova.enabled")` blocks in mozilla-central.',
        " *",
        " * Scoped to :root.nova, which base.html sets when the Nova preview is on,",
        " * so this file is inert otherwise. */",
        "",
        "/* Load this sheet FIRST so this statement, not the one at the top of",
        " * tokens-shared.css, fixes the layer order. Otherwise the nova layers get",
        " * appended after tokens-forced-colors and stomp the high-contrast values. */",
        "@layer tokens-foundation, tokens-foundation-nova,",
        "  tokens-prefers-contrast, tokens-prefers-contrast-nova,",
        "  tokens-forced-colors, tokens-forced-colors-nova;",
        "",
    ]

    for layer in LAYER_ORDER:
        rules = [
            (selector, source_layers[layer])
            for selector, source_layers in sections
            if source_layers.get(layer)
        ]
        if not rules:
            continue

        out.append(f"@layer {layer} {{")
        wrapper = wrappers.get(layer)
        indent = "    " if wrapper else "  "
        if wrapper:
            out.append(f"  {wrapper} {{")
        out.append("\n\n".join(render_rule(sel, decls, indent) for sel, decls in rules))
        if wrapper:
            out.append("  }")
        out.append("}")
        out.append("")

    return "\n".join(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--firefox-root",
        type=Path,
        help="Read from a local mozilla-central checkout instead of GitHub.",
    )
    args = parser.parse_args()
    firefox_root = (
        args.firefox_root.expanduser().resolve() if args.firefox_root else None
    )

    used = referenced_properties()
    print(f"static/ references {len(used)} custom properties")

    sections: list[tuple[str, dict[str, list[tuple[str, str]]]]] = []

    globals_layers: dict[str, list[tuple[str, str]]] = {}
    for path in GLOBAL_SOURCES:
        print(f"Reading {path}")
        for layer, decls in parse_nova(read_source(path, firefox_root)).items():
            globals_layers.setdefault(layer, []).extend(decls)
    if not globals_layers:
        sys.exit(
            "No nova blocks found in the global token sheets — has the gating changed?"
        )
    sections.append((":root.nova", filter_declarations(globals_layers, used)))

    for name in COMPONENTS:
        if not (STATIC / "components" / name).is_dir():
            print(f"Skipping {name} (not vendored)")
            continue
        path = COMPONENT_SOURCE.format(name=name)
        print(f"Reading {path}")
        layers = filter_declarations(parse_nova(read_source(path, firefox_root)), used)
        if any(layers.values()):
            sections.append((f":root.nova {name}", layers))
        else:
            print(f"  nothing the vendored {name} reads, skipping")

    OUTPUT.write_text(render(sections))
    total = sum(len(d) for _, layers in sections for d in layers.values())
    print(f"\nWrote {OUTPUT.relative_to(ROOT)} — {total} declarations.")


if __name__ == "__main__":
    main()

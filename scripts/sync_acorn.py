#!/usr/bin/env python3
"""
Refresh the vendored copy of Acorn for Web (https://github.com/FirefoxUX/acorn-web).

`static/` holds a copy of acorn-web's `dist/` alongside a handful of
fxsharing-owned files (moz-share.mjs, our own stylesheets and assets, ...). This
script copies upstream over the top of ours and *never deletes* anything, so the
local additions survive a refresh.

The upstream commit is recorded in static/ACORN_REVISION so the next refresh is a
diff rather than a guess.

Never edit a vendored file in place — a refresh will silently drop the change.
Put fxsharing rules in our own stylesheets and fxsharing behaviour in a subclass
(see static/components/moz-share.mjs). Read the `~` lines this prints before
committing; anything surprising there is a local edit being overwritten.

    uv run python scripts/sync_acorn.py                 # clone main into a temp dir
    uv run python scripts/sync_acorn.py --ref <sha>     # pin a revision
    uv run python scripts/sync_acorn.py --repo ~/code/acorn-web   # use a local checkout
"""

import argparse
import filecmp
import shutil
import subprocess  # noqa: S404 - git only, no shell, fixed argv
import sys
import tempfile
from pathlib import Path

REPO_URL = "https://github.com/FirefoxUX/acorn-web.git"
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
REVISION_FILE = STATIC_DIR / "ACORN_REVISION"

# dist/ subpath -> static/ subpath. Every file under the source is copied to the
# matching destination; files that only exist in static/ are left alone.
TREE_MAP = {
    "assets": "assets",
    "components": "components",
    "dependencies": "dependencies",
    "docs": "docs",
    "locales": "locales",
    "styles": "styles",
}
FILE_MAP = {
    "index.mjs": "index.mjs",
    "fluent-setup.mjs": "fluent-setup.mjs",
}


def git(*args, cwd=None):
    return subprocess.run(  # noqa: S603 - fixed argv, no shell
        ["git", *args],  # noqa: S607 - git is expected on PATH
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def copy_file(src: Path, dest: Path, changed: list, added: list):
    if dest.exists():
        if filecmp.cmp(src, dest, shallow=False):
            return
        changed.append(dest)
    else:
        added.append(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def sync(dist: Path):
    changed: list[Path] = []
    added: list[Path] = []

    for src_name, dest_name in TREE_MAP.items():
        src_root = dist / src_name
        if not src_root.is_dir():
            print(f"warning: {src_root} missing upstream, skipping")
            continue
        for src in sorted(p for p in src_root.rglob("*") if p.is_file()):
            dest = STATIC_DIR / dest_name / src.relative_to(src_root)
            copy_file(src, dest, changed, added)

    for src_name, dest_name in FILE_MAP.items():
        src = dist / src_name
        if src.is_file():
            copy_file(src, STATIC_DIR / dest_name, changed, added)
        else:
            print(f"warning: {src} missing upstream, skipping")

    return changed, added


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo",
        help="Path to a local acorn-web checkout. Defaults to cloning from GitHub.",
    )
    parser.add_argument("--ref", default="main", help="Branch, tag or SHA to sync.")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        if args.repo:
            repo = Path(args.repo).expanduser().resolve()
        else:
            repo = Path(tmp) / "acorn-web"
            print(f"Cloning {REPO_URL} ({args.ref})...")
            git(
                "clone",
                "--quiet",
                "--depth",
                "1",
                "--branch",
                args.ref,
                REPO_URL,
                str(repo),
            )

        dist = repo / "dist"
        if not dist.is_dir():
            sys.exit(
                f"{dist} not found. acorn-web gitignores dist/ — build it with "
                "`npm run build` (needs FIREFOX_ROOT) or sync from a checkout that has it."
            )

        sha = git("rev-parse", "HEAD", cwd=repo)
        changed, added = sync(dist)
        REVISION_FILE.write_text(f"{sha}\n")

    for path in added:
        print(f"  + {path.relative_to(STATIC_DIR.parent)}")
    for path in changed:
        print(f"  ~ {path.relative_to(STATIC_DIR.parent)}")
    print(f"\nSynced acorn-web @ {sha}: {len(added)} added, {len(changed)} updated.")
    print("Nothing was deleted — check `git status` for files upstream has dropped.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Generate a .env file from .env.example with a fresh SECRET_KEY.
Safe to run multiple times — skips if .env already exists.
"""
import os
import sys


def main():
    if os.path.exists(".env"):
        print(".env already exists, skipping")
        return

    try:
        from django.core.management.utils import get_random_secret_key
    except ImportError:
        print("Error: Django not installed. Run `uv sync` first.")
        sys.exit(1)

    with open(".env.example") as f:
        contents = f.read()

    contents = contents.replace("SECRET_KEY=", f"SECRET_KEY={get_random_secret_key()}", 1)

    with open(".env", "w") as f:
        f.write(contents)

    print("Created .env — set DATABASE_URL before running")


if __name__ == "__main__":
    main()

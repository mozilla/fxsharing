# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Firefox content sharing prototype — allows users to create and share collections of links. Built with Django 6.0.3, Python 3.14, managed with UV. Licensed under MPL 2.0.

## Commands

```bash
# Install dependencies
uv sync

# Run dev server
uv run python manage.py runserver

# Migrations
uv run python manage.py makemigrations
uv run python manage.py migrate

# Run all tests
uv run python manage.py test

# Run tests for shares app
uv run python manage.py test fxsharing.shares

# Django shell
uv run python manage.py shell
```

## Architecture

Single Django project (`fxsharing/`) with one app:

- **`fxsharing/shares/`** — Core app. Two models: `Share` (a collection owned by a Firefox Account via `fxa_id`) and `Link` (a URL belonging to a Share). Both use UUID primary keys (`uuid.uuid7`).

URL routing: `fxsharing/urls.py` includes `fxsharing/shares/urls.py` at the root path, plus Django admin at `/admin/`.

Database: SQLite3 for development.

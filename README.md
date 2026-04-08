# fxsharing

Prototype for Firefox content sharing — lets users create and share collections of links. Built with Django 6, Python 3.13, managed with [uv](https://docs.astral.sh/uv/).

## Setup

```bash
# Install dependencies and generate .env (with SECRET_KEY pre-filled)
make setup

# Set DATABASE_URL in .env, then run migrations
make migrate

# Run the dev server
make run
```

`make setup` copies `.env.example` to `.env` and generates a `SECRET_KEY`. You still need to set `DATABASE_URL` to a local PostgreSQL instance before running.

## API

- `POST /create_share` — create a share (JSON body, see `share_schema.py` for schema)
- `GET /<uuid>` — view share page
- `GET /api/<uuid>` — share data as JSON

## Prototype limitations

This is an early prototype. Known gaps before production:

- `SECRET_KEY` is hardcoded in `settings.py` — treat as compromised, will move to env var
- No authentication (FxA integration planned)
- No rate limiting
- SQLite only — PostgreSQL migration planned
- OpenGraph scraping is synchronous — will move to Celery workers
- No tests
- `DEBUG = True` and `ALLOWED_HOSTS = []` — not suitable for deployment as-is

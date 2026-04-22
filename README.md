# fxsharing

Prototype for Firefox content sharing — lets users create and share collections of links. Built with Django 6, Python 3.13, managed with [uv](https://docs.astral.sh/uv/).

## Setup

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/). Everything else (Python, Postgres) runs inside Docker.

```bash
make setup   # generate .env with a random SECRET_KEY
make up      # build and start app and Postgres
```

The app will be available at `http://localhost:8000`. Migrations run automatically on `make up`.

### Without Docker

Requires [Python 3.13+](https://www.python.org/), [uv](https://docs.astral.sh/uv/getting-started/installation/), and a running [PostgreSQL](https://www.postgresql.org/download/) instance.

```bash
make setup   # install dependencies and generate .env
```

Set `DATABASE_URL` in `.env` to your local Postgres connection string, e.g.:

```
DATABASE_URL=postgres://localhost/fxsharing
```

Then:

```bash
make migrate  # apply migrations
make run      # start the dev server
```

## API

- `POST /create_share` — create a share (JSON body, see `share_schema.py` for schema)
- `GET /<uuid>` — view share page
- `GET /api/<uuid>` — share data as JSON

## Prototype limitations

This is an early prototype. Known gaps before production:

- No authentication (FxA integration planned)
- No rate limiting
- OpenGraph scraping is synchronous — will move to Celery workers
- No tests

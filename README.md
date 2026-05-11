# fxsharing

Prototype for Firefox content sharing — lets users create and share collections of links. Built with Django 6, Python 3.14, managed with [uv](https://docs.astral.sh/uv/).

## Setup

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/). Everything else (Python, Postgres, Redis) runs inside Docker.

```bash
make setup   # generate .env with a random SECRET_KEY
make up      # build and start app, Postgres, Redis, Celery worker, and Flower
```

The app will be available at `http://localhost:8000`. Migrations run automatically on `make up`.

To monitor Celery tasks, open [Flower](http://localhost:5555) — a real-time dashboard showing worker status, task history, and failure tracebacks.

To tail worker logs directly:

```bash
docker compose logs -f worker
```

### Without Docker

Requires [Python 3.14+](https://www.python.org/), [uv](https://docs.astral.sh/uv/getting-started/installation/), a running [PostgreSQL](https://www.postgresql.org/download/) instance, and a running [Redis](https://redis.io/docs/getting-started/) instance.

```bash
make setup   # install dependencies and generate .env
```

Set `DATABASE_URL` and `REDIS_URL` in `.env` to your local connection strings, e.g.:

```
DATABASE_URL=postgres://localhost/fxsharing
REDIS_URL=redis://localhost:6379/0
```

Then run each of these in separate terminals:

```bash
make migrate  # apply migrations (first time only)
make run      # start the dev server
make worker   # start the Celery worker
make flower   # start the Flower task monitor (http://localhost:5555)
```

## API

The `/__lbheartbeat__`, `/__heartbeat__`, and `/__version__` endpoints are provided by the [python-dockerflow](https://github.com/mozilla-services/python-dockerflow) library.

- `GET /__lbheartbeat__` — load balancer health check
- `GET /__heartbeat__` — application health check
- `GET /__version__` — deployed version info
- `POST /create_share` — create a share (JSON body, see `share_schema.py` for schema)
- `GET /<uuid>` — view share page
- `GET /api/<uuid>` — share data as JSON

## Development

### Running tests

```bash
make test
```

Tests use [pytest](https://docs.pytest.org/) with [pytest-django](https://pytest-django.readthedocs.io/). CI runs tests automatically on all pull requests.

## Prototype limitations

This is an early prototype. Known gaps before production:

- No authentication (FxA integration planned)
- No rate limiting
- No content safety review (Cinder integration planned)

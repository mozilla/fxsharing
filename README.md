# fxsharing

Server for the experimental Link Collections feature in Firefox. Learn more: https://support.mozilla.org/kb/link-collections

Built with Python, Django, Postgres, Celery, Redis, managed with [uv](https://docs.astral.sh/uv/).

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

## Bucket storage

Favicons are uploaded to a Google Cloud Storage bucket. `make setup` copies
`.env.example` to `.env`, which already points local dev at a project made specifically for testing:

```
GCS_IMAGE_BUCKET=favicon-bucket-2
GOOGLE_CLOUD_PROJECT=niklas-test-fx-sharing
GOOGLE_APPLICATION_CREDENTIALS=/app/.gcloud_credentials
```

(In dev/prod these are injected via k8s and auth uses Workload Identity, so you don't set them there.)

To get credentials for the test project locally:

1. Install the Google Cloud SDK: https://docs.cloud.google.com/sdk/docs/install-sdk

2. Ask a project admin to grant your Google account access to `niklas-test-fx-sharing`
   (at least the `Storage Object Admin` role on `favicon-bucket-2`).

3. Generate Application Default Credentials:

   ```bash
   gcloud auth application-default login
   ```

4. The app runs in Docker, where the project root is bind-mounted to `/app`. Copy the credentials
   into the repo root as `.gcloud_credentials` so the container can read them at
   `/app/.gcloud_credentials` (the path `.env` already expects):

   ```bash
   cp ~/.config/gcloud/application_default_credentials.json .gcloud_credentials
   ```

   `.gcloud_credentials` is gitignored, so it won't be committed. Re-run this `cp` whenever you
   refresh your credentials with `gcloud auth application-default login`.

If `GCS_IMAGE_BUCKET` is unset, favicon uploads are skipped — the app still works without bucket
storage configured.

## API

The `/__lbheartbeat__`, `/__heartbeat__`, and `/__version__` endpoints are provided by the [python-dockerflow](https://github.com/mozilla-services/python-dockerflow) library.

- `GET /__lbheartbeat__` — load balancer health check
- `GET /__heartbeat__` — application health check
- `GET /__version__` — deployed version info
- `POST /api/v1/create` — create a share (requires authentication; JSON body, see `share_schema.py` for schema)
- `GET /<shortcode>` — view share page
- `POST /report/<shortcode>` — report a share (form POST, `reason` field required; valid values: `copyright`, `harmful`, `spam`, `other`)
- `POST /api/v1/ts_response` — Cinder `decision.created` webhook receiver (HMAC-signed via `CINDER_WEBHOOK_TOKEN`, see `cinder_schema.py` for the expected payload shape)

To test authenticated endpoints locally, log in first via the dummy FxA provider at `http://localhost:8000/accounts/dummy/login/`.

## Development

### Seeding sample data

Populate the database with diverse, edge-case sample data (shares with the
maximum number of links, small shares, nested shares, expired shares,
soft-deleted shares, a banned user, a soft-deleted user, and shares in various
moderation statuses):

```bash
make seed
```

`make seed` targets the right database automatically: if the Docker stack is
running (`make up`), it seeds inside the `app` container; otherwise it seeds your
local database. This matters because the two run against different databases —
seeding the host while the Dockerized app reads the container's database would
leave the app looking empty.

The command is idempotent — every run wipes the previously seeded users (their
`fxa_id` is prefixed with `seed-`) and recreates everything from scratch. It
only runs when `DEBUG=True`; with `DEBUG=False` it exits with an error.

### Logging in as a seed user (dev-login)

When `DEBUG=True`, a dev-only login page is available at
[`http://localhost:8000/dev-login`](http://localhost:8000/dev-login). It lists
every user (including banned and soft-deleted ones) and lets you log in as any of
them with one click — no real FxA OAuth required — so you can manually QA
authenticated flows as a specific seed user. The same page has a log-out button.
This route does not exist when `DEBUG=False`.

### Local Cinder mock

The app's content-safety integration POSTs each shared URL to
[Cinder](https://www.cinder.ai/)'s `link_sharing_quality` workflow and listens
for the resulting `decision.created` webhook on `/api/v1/ts_response`. For
local development, `scripts/mock_cinder.py` stands in for the real Cinder
service: it accepts the workflow event POSTs and fires signed `decision.created`
webhook callbacks back at the app.

Start the mock in its own terminal:

```bash
make mock-cinder
```

The mock listens on `http://localhost:8081`. Point the app at it by setting
the following in `.env` and restarting the dev server (or the `app` container):

```
CINDER_URL=http://localhost:8081
CINDER_WEBHOOK_TOKEN=any-string-you-like
```

The mock signs its callbacks using `CINDER_WEBHOOK_TOKEN`, so the same value
must be in the environment where the mock runs (it inherits from `.env` via
`uv run`). If the secrets don't match, `ts_webhook` rejects the callback as
an invalid signature.

The mock decides which Cinder branch to simulate from the submitted URL:

- contains `malware`, `phishing`, or `unwanted` → Web Risk threat → share is
  marked `BLOCKED` (whole lineage).
- contains `csam` or `ncmec` → NCMEC hash match → share is marked `BLOCKED`.
- anything else → approve, share stays `ACTIVE`.

`http://malware.testing.google.test/testing/malware/` is Google's canonical
Web Risk test URL and is convenient for exercising the high-risk path.

Useful flags:

- `--delay <seconds>` — wait this long before firing the webhook (default
  `0.5`, simulates Cinder latency). Pass `0` to fire before `create_share`
  even responds to the browser.
- `--webhook-url <url>` — override the receiver URL when the app isn't on
  `http://127.0.0.1:8000`.

Both directions are JSON-Schema validated against
`fxsharing/shares/cinder_schema.py`: the mock rejects malformed workflow events
with 400, and `ts_webhook` rejects malformed `decision.created` payloads the
same way. The mock implements only the standard signed `decision.created`
webhook; Cinder's optional unsigned observability webhook isn't simulated.

### Running tests

```bash
make test
```

Tests use [pytest](https://docs.pytest.org/) with [pytest-django](https://pytest-django.readthedocs.io/). CI runs tests automatically on all pull requests.

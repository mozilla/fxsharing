FROM python:3.13-slim-bookworm AS python-builder

# Suppress interactive prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies:
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy uv binary from the official uv image
COPY --from=ghcr.io/astral-sh/uv:0.6.0 /uv /bin/uv

WORKDIR /app

# Create a virtual environment at /opt/venv.
# UV_PROJECT_ENVIRONMENT tells uv sync to install into this venv
# rather than its default .venv in the project directory.
ENV VIRTUAL_ENV=/opt/venv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install production dependencies from the lockfile.
COPY pyproject.toml uv.lock /app/
RUN uv sync --frozen --no-dev


FROM python-builder AS static-builder

# Placeholder values 
ARG SECRET_KEY=placeholder
ARG DATABASE_URL=postgres://placeholder/placeholder
ENV SECRET_KEY=${SECRET_KEY}
ENV DATABASE_URL=${DATABASE_URL}

COPY . /app/

RUN python manage.py collectstatic --noinput

# Stage 3: Runtime image
FROM python:3.13-slim-bookworm AS server

ARG USER_ID=1000
ARG GROUP_ID=1000

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

# Install only runtime dependencies (not build tools):
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user and group to run the app
RUN groupadd -r --gid=${GROUP_ID} fxsharing \
    && useradd --uid=${USER_ID} --no-log-init -r -m -g fxsharing \
       --shell /usr/sbin/nologin fxsharing

WORKDIR /app

# Copy Python virtual environment from builder
COPY --from=python-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY --chown=fxsharing:fxsharing . /app/
# Copy collected assets from static-builder stage
COPY --from=static-builder --chown=fxsharing:fxsharing /app/staticfiles /app/staticfiles

USER fxsharing

# Document that the app listens on port 8000
EXPOSE 8000

STOPSIGNAL SIGINT

ENTRYPOINT ["gunicorn"]
CMD ["--config", "gunicorn.conf.py", "fxsharing.wsgi:application"]

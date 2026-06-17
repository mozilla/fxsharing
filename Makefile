.DEFAULT_GOAL := help

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  setup    Install dependencies and create .env from .env.example"
	@echo "  run      Start the development server"
	@echo "  migrate  Apply database migrations"
	@echo "  seed     Seed sample data — Docker DB if the stack is up, else local (DEBUG only)"
	@echo "  test     Run tests with pytest"
	@echo "  lint     Run ruff linter and format check"
	@echo "  format   Auto-format and fix lint issues with ruff"
	@echo "  worker   Start the Celery worker (local dev)"
	@echo "  flower   Start the Flower task monitor (local dev, http://localhost:5555)"
	@echo "  mock-cinder  Start the local Cinder mock server (http://localhost:8081)"
	@echo "  up       Start all services via docker compose"
	@echo "  down     Stop all services"
	@echo "  logs     Tail docker compose logs"

setup:
	uv sync
	uv run python scripts/generate_env.py

run:
	uv run python manage.py runserver

migrate:
	uv run python manage.py migrate

seed:
	@if docker compose ps --status running --services 2>/dev/null | grep -qx app; then \
		echo "Seeding the Docker database (app container)..."; \
		docker compose exec app python manage.py seed; \
	else \
		echo "Seeding the local database..."; \
		uv run python manage.py seed; \
	fi

test:
	uv run pytest

lint:
	uv run ruff check fxsharing/
	uv run ruff format --check fxsharing/

format:
	uv run ruff check --fix fxsharing/
	uv run ruff format fxsharing/

worker:
	uv run celery -A fxsharing worker -l info

flower:
	uv run celery -A fxsharing flower --port=5555

mock-cinder:
	uv run python scripts/mock_cinder.py

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

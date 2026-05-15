.DEFAULT_GOAL := help

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  setup    Install dependencies and create .env from .env.example"
	@echo "  run      Start the development server"
	@echo "  migrate  Apply database migrations"
	@echo "  test     Run tests with pytest"
	@echo "  lint     Run ruff linter and format check"
	@echo "  format   Auto-format and fix lint issues with ruff"
	@echo "  worker   Start the Celery worker (local dev)"
	@echo "  flower   Start the Flower task monitor (local dev, http://localhost:5555)"
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

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

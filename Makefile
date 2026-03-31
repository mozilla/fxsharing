.DEFAULT_GOAL := help

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  setup    Install dependencies and create .env from .env.example"
	@echo "  run      Start the development server"
	@echo "  migrate  Apply database migrations"
	@echo "  test     Run tests"

setup:
	uv sync
	uv run python scripts/generate_env.py

run:
	uv run python manage.py runserver

migrate:
	uv run python manage.py migrate

test:
	uv run python manage.py test

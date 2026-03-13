.PHONY: dev dev-front up down test test-int lint format

dev:
	uv run --package backend uvicorn backend.main:app --reload --port 8000

dev-front:
	cd packages/frontend && bun run dev

up:
	docker compose up --build -d

down:
	docker compose down

test:
	uv run pytest tests/unit_tests/ -v

test-int:
	uv run pytest tests/integration_tests/ -v

lint:
	uv run ruff check packages/core/ packages/backend/ tests/

format:
	uv run ruff format packages/core/ packages/backend/ tests/

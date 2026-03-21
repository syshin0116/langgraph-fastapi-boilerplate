.PHONY: dev dev-front up down test test-int lint format

dev:
	cd backend && uv run uvicorn api.main:app --reload --port 8000

dev-front:
	cd frontend && bun run dev

up:
	docker compose up --build -d

down:
	docker compose down

test:
	cd backend && uv run pytest tests/unit_tests/ -v

test-int:
	cd backend && uv run pytest tests/integration_tests/ -v

lint:
	cd backend && uv run ruff check src/ tests/

format:
	cd backend && uv run ruff format src/ tests/

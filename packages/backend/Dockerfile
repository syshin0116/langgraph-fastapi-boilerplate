FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
COPY packages/core/ packages/core/
COPY packages/backend/ packages/backend/

RUN uv sync --frozen --no-dev --package backend

CMD ["uv", "run", "--package", "backend", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

.PHONY: dev data-server start test lint

dev:
	uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000

data-server:
	uv run python simulated-data/main.py

start:
	uv run fastapi run app/main.py

test:
	uv run pytest -v

lint:
	uv run ruff check app tests
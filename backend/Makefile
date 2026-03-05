.PHONY: dev start test lint

dev:
	uv run fastapi dev app/main.py

start:
	uv run fastapi run app/main.py

test:
	uv run pytest -v

lint:
	uv run ruff check app tests

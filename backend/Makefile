.PHONY: dev dev-all data-server start test lint

# Backend only (assumes simulator already running in another terminal)
dev:
	uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000

# Start simulator + backend together (trap ensures both die on Ctrl-C)
dev-all:
	@trap 'kill 0' INT; \
	uv run python simulated-data/main.py & \
	sleep 2 && \
	uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000

data-server:
	uv run python simulated-data/main.py

start:
	uv run fastapi run app/main.py

test:
	uv run pytest -v

lint:
	uv run ruff check app tests
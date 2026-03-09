# ─────────────────────────────────────────────────────────────────────────────
# Tripolar Industries — Backend
# RunPod GPU deployment (CUDA 12.4 + Python 3.12 + vLLM + FastAPI)
#
# Build:   docker build -t tripolar-backend .
# Run:     docker run --gpus all -p 8000:8000 --env-file .env tripolar-backend
# ─────────────────────────────────────────────────────────────────────────────

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # HuggingFace cache → RunPod network volume (override via env var)
    HF_HOME=/workspace/.hf_cache \
    # uv installs to ~/.local/bin
    PATH="/root/.local/bin:$PATH"

# ── System deps ───────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common curl git ca-certificates \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
        python3.12 python3.12-venv python3.12-dev \
    && ln -sf /usr/bin/python3.12 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# ── uv ────────────────────────────────────────────────────────────────────────
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# ── Python deps ───────────────────────────────────────────────────────────────
WORKDIR /workspace

# Copy lock files first so Docker caches this layer until deps change
COPY pyproject.toml uv.lock ./

# Install all dependencies from the lockfile (no dev extras)
# --no-install-project: install deps only, not the project itself yet
RUN uv sync --frozen --no-dev --no-install-project --python 3.12

# ── App code ──────────────────────────────────────────────────────────────────
COPY app/ ./app/

# Persistent storage dirs (override with RunPod volume mounts)
RUN mkdir -p models logs data

# ── Port ──────────────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Runtime environment defaults ─────────────────────────────────────────────
# Override ALL of these at runtime via --env-file .env or RunPod env vars
ENV DATABASE_URL="sqlite:///./data/tripolar.db" \
    SECRET_KEY="" \
    ALGORITHM="HS256" \
    ACCESS_TOKEN_EXPIRE_MINUTES="30" \
    # Frontend origin(s) — set to your Vercel URL in production
    # Example: "https://my-app.vercel.app"
    ALLOWED_ORIGINS="http://localhost:3000" \
    ALLOW_ORIGIN_REGEX="" \
    LOG_LEVEL="INFO" \
    LOG_FORMAT="json"

# ── Entrypoint ────────────────────────────────────────────────────────────────
# workers=1 is required: vLLM engine is a singleton, multiple workers would
# each try to load the model into VRAM independently.
CMD ["uv", "run", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1"]

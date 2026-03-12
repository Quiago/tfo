# ─────────────────────────────────────────────────────────────────────────────
# Tripolar Industries — Backend
# RunPod GPU deployment (CUDA 12.4 + Python 3.12 + vLLM + FastAPI)
# ─────────────────────────────────────────────────────────────────────────────

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/workspace/.hf_cache \
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
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --python 3.12

# ── App code ──────────────────────────────────────────────────────────────────
COPY app/ ./app/
COPY simulated-data/ ./simulated-data/

# ── Scripts ───────────────────────────────────────────────────────────────────
COPY entrypoint.sh ./entrypoint.sh
COPY auto_stop.sh ./auto_stop.sh
RUN chmod +x entrypoint.sh auto_stop.sh

# ── Runtime dirs (overridden by RunPod Network Volume at /workspace) ──────────
RUN mkdir -p /workspace/logs /workspace/.hf_cache

# ── Port ──────────────────────────────────────────────────────────────────────
EXPOSE 8000 4840 8001

# ── Runtime env defaults (override ALL via RunPod env vars) ──────────────────
ENV DATABASE_URL="sqlite:///./tripolar.db" \
    SECRET_KEY="" \
    ALGORITHM="HS256" \
    ACCESS_TOKEN_EXPIRE_MINUTES="30" \
    ALLOWED_ORIGINS="http://localhost:3000" \
    ALLOW_ORIGIN_REGEX="" \
    LOG_LEVEL="INFO" \
    LOG_FORMAT="json" \
    OPCUA_ENDPOINT="opc.tcp://0.0.0.0:4840/tripolar/" \
    REST_HOST="0.0.0.0" \
    REST_PORT="8001" \
    IDLE_THRESHOLD_SECONDS="600"

# ── Entrypoint ────────────────────────────────────────────────────────────────
CMD ["/app/entrypoint.sh"]

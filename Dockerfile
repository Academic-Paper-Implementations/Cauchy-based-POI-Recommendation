# --- Stage 1: build the React app ---
FROM node:20-alpine AS web
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/explorer.html frontend/vite.config.js frontend/postcss.config.js ./
COPY frontend/src ./src
COPY frontend/public ./public
RUN npm run build

# --- Stage 2: compile the C++ miner ---
# The engine is sequential and header-only in its dependencies, so g++ and the
# standard library are all it needs.
FROM debian:bookworm-slim AS engine
RUN apt-get update && apt-get install -y --no-install-recommends g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /engine
COPY backend/engine/src ./src
COPY backend/engine/include ./include
RUN g++ -O2 -std=c++17 src/*.cpp -Iinclude -o colocation_miner

# --- Stage 3: python runtime serving the API and the built SPA on one port ---
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY --from=web /app/dist ./frontend/dist
COPY --from=engine /engine/colocation_miner ./backend/engine/bin/colocation_miner

# Prepared datasets, job workspaces, and the mining result cache live here. A
# single mine can take minutes, so mount a volume on this path to keep results
# across container restarts:
#   docker run -p 8000:8000 -v colocation-cache:/app/backend/runtime colocation-app
ENV MINING_RUNTIME_DIR=/app/backend/runtime
VOLUME ["/app/backend/runtime"]

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

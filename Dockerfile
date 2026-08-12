# --- Stage 1: build the React app ---
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js postcss.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# --- Stage 2: compile the C++ miner ---
# The engine is sequential and header-only in its dependencies, so g++ and the
# standard library are all it needs.
FROM debian:bookworm-slim AS engine
RUN apt-get update && apt-get install -y --no-install-recommends g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /engine
COPY server/engine/src ./src
COPY server/engine/include ./include
RUN g++ -O2 -std=c++17 src/*.cpp -Iinclude -o colocation_miner

# --- Stage 3: python runtime serving the API and the built SPA on one port ---
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY server ./server
COPY --from=web /app/dist ./dist
COPY --from=engine /engine/colocation_miner ./server/engine/bin/colocation_miner

# Prepared datasets, job workspaces, and the mining result cache live here. A
# single mine can take minutes, so mount a volume on this path to keep results
# across container restarts:
#   docker run -p 8000:8000 -v colocation-cache:/app/server/runtime colocation-app
ENV MINING_RUNTIME_DIR=/app/server/runtime
VOLUME ["/app/server/runtime"]

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]

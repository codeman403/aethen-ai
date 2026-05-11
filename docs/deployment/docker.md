# Docker

---

## Dockerfile

`backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

**Design decisions:**
- `python:3.11-slim` — minimal base image
- `requirements.txt` (not Poetry) at build time — avoids Poetry overhead in Docker
- `${PORT:-8000}` — reads PORT from environment (Render sets this automatically)

---

## Generating `requirements.txt`

`requirements.txt` is generated from `poetry.lock` and committed:

```bash
cd backend
poetry export --only main --without-hashes -f requirements.txt -o requirements.txt
```

Run this command whenever dependencies change in `pyproject.toml`.

---

## Building Locally

```bash
cd backend

# Build
docker build -t aethen-backend:latest .

# Run with environment variables
docker run --env-file .env -p 8000:8000 aethen-backend:latest

# Health check
curl http://localhost:8000/api/health
```

---

## Docker Compose (Local Development)

A minimal `docker-compose.yml` for local development (not committed, for reference):

```yaml
version: "3.9"
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file:
      - ./backend/.env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Note: This does not include Postgres or Neo4j — use Supabase and Neo4j Aura for those services even locally.

---

## Render Docker Build

Render builds the Docker image automatically from `backend/render.yaml`:

```yaml
services:
  - type: web
    name: aethen-ai-backend
    runtime: docker
    dockerfilePath: ./Dockerfile
    plan: free
    healthCheckPath: /api/health
```

Build triggers on every push to the connected branch. Build logs available in Render dashboard → Service → Deploys.

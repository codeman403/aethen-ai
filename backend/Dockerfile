FROM python:3.11-slim

WORKDIR /app

# Install system deps needed by some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN pip install --no-cache-dir poetry==1.8.3

# Copy dependency files first for layer caching
COPY pyproject.toml poetry.lock ./

# Install dependencies without dev deps, don't create a virtualenv (we're in a container)
RUN poetry config virtualenvs.create false \
    && poetry install --only main --no-root --no-interaction

# Copy application code
COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

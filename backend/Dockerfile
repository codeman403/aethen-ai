FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry 2.x (matches pyproject.toml which uses poetry-core>=2.0.0)
RUN pip install --no-cache-dir "poetry==2.1.3"

# Copy dependency files for layer caching
COPY pyproject.toml poetry.lock ./

# Export production deps to requirements.txt, then install with pip
# This keeps Poetry out of the final runtime path and speeds up installs
RUN poetry export -f requirements.txt --without-hashes --only main -o requirements.txt \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

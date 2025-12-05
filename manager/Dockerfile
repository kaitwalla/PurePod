FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY manager/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY manager/src ./src
COPY shared ./shared

# Create audio storage directory
RUN mkdir -p /app/audio

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]

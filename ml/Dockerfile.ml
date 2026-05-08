FROM python:3.11-slim

WORKDIR /app

# System deps for cvxpy / scipy build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway provides PORT dynamically; default to 8000 for local docker run.
ENV PORT=8000
EXPOSE 8000

# Use shell form so $PORT expands at runtime.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]

FROM python:3.11-slim

# ---- Layer 1: System deps (rarely changes) ----
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Layer 2: Removed ----
# We now use browserless via WebSocket, so we don't need local browsers.

# ---- Layer 3: Pip packages (changes occasionally) ----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Layer 4: Application code (changes frequently) ----
COPY . .

# Run the daemon
CMD ["python", "main.py"]

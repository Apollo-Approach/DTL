FROM python:3.11-slim

# ---- Layer 1: System deps (rarely changes) ----
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Layer 2: Browser binaries (rarely changes, 700MB+) ----
# Install Playwright and Camoufox BEFORE pip packages so that
# adding a new pip dependency doesn't trigger a 713MB re-download.
RUN pip install --no-cache-dir playwright camoufox
RUN playwright install --with-deps firefox
RUN python -m camoufox fetch

# ---- Layer 3: Pip packages (changes occasionally) ----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Layer 4: Application code (changes frequently) ----
COPY . .

# Run the daemon
CMD ["python", "main.py"]

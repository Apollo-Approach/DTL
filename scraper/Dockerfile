FROM python:3.11-slim

# Install basic tools needed before playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers and dependencies
RUN playwright install --with-deps firefox
RUN python -m camoufox fetch

COPY . .

# Run the daemon
CMD ["python", "main.py"]

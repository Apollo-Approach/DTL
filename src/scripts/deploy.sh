#!/bin/bash
set -e

REMOTE_USER="badmin"
REMOTE_HOST="10.50.50.201"
REMOTE_DIR="~/deployments/dtl-aggregator"

echo "🚀 Deploying to $REMOTE_HOST..."

# Ensure target directory exists
ssh $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"

# Rsync files (excluding node_modules and .git)
echo "📦 Syncing files..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude '.venv' \
  --exclude 'camoufox' \
  ./ $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

echo "🐳 Building and spinning up Docker containers..."
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_DIR && docker compose down && docker compose build && docker compose up -d"

echo "✅ Deployment complete. Worker is running."

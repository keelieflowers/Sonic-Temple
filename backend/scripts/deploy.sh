#!/usr/bin/env bash
# Usage: ./scripts/deploy.sh <lightsail-static-ip> [/path/to/LightsailKey.pem]
# Run this from your local machine to push the backend to Lightsail.
#
# Production server: 3.18.0.237  (api.festivalapp.flowersdev.click)
# Example: ./scripts/deploy.sh 3.18.0.237 ~/Downloads/LightsailKey.pem
set -euo pipefail

REMOTE_IP="${1:?Usage: ./scripts/deploy.sh <lightsail-static-ip> [/path/to/LightsailKey.pem]}"
PEM_FILE="${2:-}"
REMOTE_USER="ubuntu"
APP_DIR="/home/ubuntu/app"

# Build SSH args array
SSH_ARGS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
[[ -n "$PEM_FILE" ]] && SSH_ARGS=(-i "$PEM_FILE" "${SSH_ARGS[@]}")

remote() {
  ssh "${SSH_ARGS[@]}" "$REMOTE_USER@$REMOTE_IP" "$@"
}

push() {
  rsync -avz --delete -e "ssh ${SSH_ARGS[*]}" "$@"
}

# Run from backend/ regardless of where the script is called from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "==> Building TypeScript..."
npm run build

echo "==> Ensuring remote app directory exists..."
remote "mkdir -p $APP_DIR/data"

echo "==> Syncing compiled output..."
push dist/ "$REMOTE_USER@$REMOTE_IP:$APP_DIR/dist/"

echo "==> Syncing package manifests..."
rsync -avz -e "ssh ${SSH_ARGS[*]}" package.json package-lock.json \
  "$REMOTE_USER@$REMOTE_IP:$APP_DIR/"

echo "==> Syncing data files (preserving server-side cache)..."
# Sync all data files except the runtime cache (which the server owns after first deploy)
rsync -avz -e "ssh ${SSH_ARGS[*]}" \
  --exclude='final-setlists-cache.json' \
  data/ "$REMOTE_USER@$REMOTE_IP:$APP_DIR/data/"

# Only push the cache file if it doesn't exist on the server yet (first deploy)
if remote "[ ! -f $APP_DIR/data/final-setlists-cache.json ]"; then
  echo "==> Pushing initial cache file (first deploy)..."
  rsync -avz -e "ssh ${SSH_ARGS[*]}" \
    data/final-setlists-cache.json "$REMOTE_USER@$REMOTE_IP:$APP_DIR/data/"
fi

echo "==> Installing production dependencies on server..."
remote "cd $APP_DIR && npm ci --omit=dev --quiet"

echo "==> Restarting app..."
remote "cd $APP_DIR && (pm2 restart sonic-temple 2>/dev/null || pm2 start dist/src/server.js --name sonic-temple --cwd $APP_DIR) && pm2 save"

echo ""
echo "Deploy complete. App is running at https://your-domain (once DNS is set up)."
echo "To check logs: ssh into the server and run: pm2 logs sonic-temple"

#!/usr/bin/env bash
# Run this script ONCE on a fresh Lightsail Ubuntu 22.04 instance.
# SSH in first: ssh -i LightsailKey.pem ubuntu@<your-static-ip>
# Then run: bash setup-server.sh
set -euo pipefail

# Suppress needrestart interactive prompts on Ubuntu
export NEEDRESTART_MODE=a
export DEBIAN_FRONTEND=noninteractive

APP_DIR="/home/ubuntu/app"

echo "=== Sonic Temple Backend — Server Setup ==="
echo ""
read -rp "Your domain name for this API (e.g. api.yourdomain.com): " DOMAIN
read -rp "Your email (for SSL certificate renewal notices): " CERT_EMAIL
read -rsp "Setlist.fm API key: " SETLIST_API_KEY
echo ""
echo ""

# ── System ──────────────────────────────────────────────────────────────────
echo "==> Updating system packages..."
sudo apt-get update -q
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq

# ── Node.js 22 LTS ──────────────────────────────────────────────────────────
echo "==> Installing Node.js 22 LTS..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - > /dev/null
sudo DEBIAN_FRONTEND=noninteractive apt-get install -yq nodejs

# ── PM2 ─────────────────────────────────────────────────────────────────────
echo "==> Installing PM2..."
sudo npm install -g pm2 --quiet

# ── nginx + certbot ──────────────────────────────────────────────────────────
echo "==> Installing nginx and certbot..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -yq nginx certbot python3-certbot-nginx

# ── App directory ────────────────────────────────────────────────────────────
echo "==> Creating app directory..."
mkdir -p "$APP_DIR/data"

# ── .env ─────────────────────────────────────────────────────────────────────
cat > "$APP_DIR/.env" <<EOF
SETLIST_API_KEY=$SETLIST_API_KEY
PORT=3001
LOG_LEVEL=info
EOF
chmod 600 "$APP_DIR/.env"
echo "==> Created $APP_DIR/.env"

# ── nginx config (HTTP first, certbot will upgrade to HTTPS) ─────────────────
echo "==> Configuring nginx..."
sudo tee /etc/nginx/sites-available/sonic-temple > /dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/sonic-temple /etc/nginx/sites-enabled/sonic-temple
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

# ── SSL certificate ──────────────────────────────────────────────────────────
echo ""
echo "==> Obtaining SSL certificate for $DOMAIN..."
echo "    DNS for $DOMAIN must already point to this server's IP before this step."
echo "    If you haven't done that yet, Ctrl-C now, set up DNS, then re-run just this part:"
echo "    sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $CERT_EMAIL --redirect"
echo ""
read -rp "DNS is pointing here — proceed with SSL? [y/N] " PROCEED_SSL
if [[ "${PROCEED_SSL,,}" == "y" ]]; then
  sudo certbot --nginx -d "$DOMAIN" \
    --non-interactive --agree-tos \
    -m "$CERT_EMAIL" \
    --redirect
  echo "==> SSL certificate installed. Auto-renewal is handled by certbot's systemd timer."
else
  echo "==> Skipping SSL for now. Run the certbot command above when DNS is ready."
fi

# ── PM2 startup ──────────────────────────────────────────────────────────────
echo "==> Configuring PM2 to start on boot..."
# Capture the sudo command PM2 prints and run it
PM2_STARTUP_CMD=$(pm2 startup | grep "sudo env")
sudo bash -c "$PM2_STARTUP_CMD" 2>/dev/null || true

echo ""
echo "=== Server setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Run deploy.sh from your local machine:"
echo "     ./scripts/deploy.sh <your-static-ip> /path/to/LightsailKey.pem"
echo "  2. The app will be available at https://$DOMAIN"
echo "  3. To check logs after deploying: pm2 logs sonic-temple"

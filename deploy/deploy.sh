#!/bin/bash
# ============================================
# Deployment Script for crypto4pro.io
# Run as root on the server AFTER setup-server.sh
# Usage: bash deploy.sh
# ============================================

set -e

DOMAIN="crypto4pro.io"
APP_DIR="/var/www/crypto4pro"

echo "=========================================="
echo "  Deploying Crypto4Pro"
echo "=========================================="

# 1. Install dependencies
echo "[1/6] Installing npm dependencies..."
cd $APP_DIR
npm ci --production=false

# 2. Build the project
echo "[2/6] Building production bundle..."
npm run build

# 3. Set up Nginx
echo "[3/6] Configuring Nginx..."

# Copy nginx config
cp deploy/nginx.conf /etc/nginx/sites-available/$DOMAIN

# Enable site
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# 4. Get SSL certificate (first time only)
echo "[4/6] Setting up SSL..."
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
    # Temporarily use HTTP-only config for cert acquisition
    cat > /etc/nginx/sites-available/$DOMAIN-temp <<'TMPCONF'
server {
    listen 80;
    server_name crypto4pro.io www.crypto4pro.io;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
TMPCONF

    ln -sf /etc/nginx/sites-available/$DOMAIN-temp /etc/nginx/sites-enabled/$DOMAIN
    systemctl reload nginx

    certbot certonly --webroot -w /var/www/certbot \
        -d $DOMAIN -d www.$DOMAIN \
        --non-interactive --agree-tos \
        --email admin@$DOMAIN

    # Restore full SSL config
    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
    rm -f /etc/nginx/sites-available/$DOMAIN-temp

    echo "SSL certificate obtained successfully!"
else
    echo "SSL certificate already exists, skipping..."
fi

# Reload nginx with full config
systemctl reload nginx

# 5. Set up auto-renewal for SSL
echo "[5/6] Setting up SSL auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sort -u | crontab -

# 6. Start/Restart application with PM2
echo "[6/6] Starting application with PM2..."
cd $APP_DIR

# Stop existing if running
pm2 stop crypto4pro 2>/dev/null || true
pm2 delete crypto4pro 2>/dev/null || true

# Start with ecosystem config
pm2 start ecosystem.config.js

# Save PM2 process list for auto-restart on reboot
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "=========================================="
echo "  Deployment complete!"
echo ""
echo "  Your site is live at:"
echo "    https://$DOMAIN"
echo ""
echo "  Useful commands:"
echo "    pm2 status          - Check app status"
echo "    pm2 logs crypto4pro - View logs"
echo "    pm2 restart crypto4pro - Restart app"
echo "=========================================="

#!/bin/bash
# ============================================
# Server Setup Script for crypto4pro.io
# Run as root on Ubuntu 22.04/24.04
# Usage: bash setup-server.sh
# ============================================

set -e

DOMAIN="crypto4pro.io"
APP_DIR="/var/www/crypto4pro"
NODE_VERSION="20"

echo "=========================================="
echo "  Crypto4Pro Server Setup"
echo "  Domain: $DOMAIN"
echo "=========================================="

# 1. System update
echo "[1/8] Updating system packages..."
apt update && apt upgrade -y

# 2. Install essential packages
echo "[2/8] Installing essentials..."
apt install -y curl wget git build-essential ufw software-properties-common

# 3. Configure firewall
echo "[3/8] Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 4. Install Node.js via NodeSource
echo "[4/8] Installing Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt install -y nodejs

# Verify
echo "Node version: $(node -v)"
echo "npm version: $(npm -v)"

# 5. Install PM2 globally
echo "[5/8] Installing PM2..."
npm install -g pm2

# 6. Install Nginx
echo "[6/8] Installing Nginx..."
apt install -y nginx

# Start and enable nginx
systemctl start nginx
systemctl enable nginx

# 7. Install Certbot for SSL
echo "[7/8] Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# 8. Create application directory
echo "[8/8] Creating application directory..."
mkdir -p $APP_DIR
mkdir -p /var/www/certbot

echo ""
echo "=========================================="
echo "  Base setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Upload project files to $APP_DIR"
echo "  2. Run: bash deploy/deploy.sh"
echo "=========================================="

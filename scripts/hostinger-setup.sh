#!/bin/bash

# Beds25 Initial Server Setup Script for Hostinger VPS
# Run this ONCE on the server to set up the application

set -e

echo "🏨 Beds25 - Initial Server Setup"
echo "================================="
echo ""

# Configuration
APP_USER="beds25"
APP_DIR="/var/www/beds25"
APP_PORT="3003"
DOMAIN="bookings.yourdomain.com"  # Change this to your actual domain

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "❌ Please run as root (use sudo)"
   exit 1
fi

echo "📝 This script will:"
echo "  1. Create user: $APP_USER"
echo "  2. Set up directory: $APP_DIR"
echo "  3. Install application on port: $APP_PORT"
echo "  4. Configure PM2 process manager"
echo "  5. Update Caddy reverse proxy"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Step 1: Create dedicated user
echo ""
echo "👤 Creating user: $APP_USER..."
if id "$APP_USER" &>/dev/null; then
    echo "⚠️  User $APP_USER already exists"
else
    useradd -m -s /bin/bash $APP_USER
    echo "✅ User created"
fi

# Step 2: Create application directory
echo ""
echo "📁 Setting up directory: $APP_DIR..."
mkdir -p $APP_DIR
chown $APP_USER:$APP_USER $APP_DIR

# Step 3: Clone repository
echo ""
echo "📥 Cloning repository..."
cd $APP_DIR
if [ -d ".git" ]; then
    echo "⚠️  Repository already cloned"
else
    sudo -u $APP_USER git clone https://github.com/Janbo63/beds25.git .
    echo "✅ Repository cloned"
fi

# Step 4: Set up environment file
echo ""
echo "🔐 Setting up environment variables..."
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists"
else
    sudo -u $APP_USER cp .env.example .env
    echo "⚠️  IMPORTANT: Edit /var/www/beds25/.env with your actual credentials!"
    echo "   - DATABASE_URL"
    echo "   - ZOHO_CLIENT_ID"
    echo "   - ZOHO_CLIENT_SECRET"
    echo "   - ZOHO_REFRESH_TOKEN"
fi

# Step 5: Install dependencies
echo ""
echo "📦 Installing Node.js dependencies..."
sudo -u $APP_USER npm install

# Step 6: Generate Prisma client
echo ""
echo "🔧 Generating Prisma client..."
sudo -u $APP_USER npx prisma generate

# Step 7: Initialize database
echo ""
echo "🗄️  Initializing database..."
sudo -u $APP_USER npx prisma db push

# Step 8: Build application
echo ""
echo "🏗️  Building application..."
sudo -u $APP_USER npm run build

# Step 9: Start with PM2
echo ""
echo "🚀 Starting application with PM2..."
sudo -u $APP_USER pm2 start npm --name "beds25" -- start
sudo -u $APP_USER pm2 save

# Configure PM2 to start on boot
echo ""
echo "⚙️  Configuring PM2 startup..."
env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp /home/$APP_USER

# Step 10: Configure Caddy
echo ""
echo "🌐 Configuring Caddy reverse proxy..."
CADDY_CONFIG="/etc/caddy/Caddyfile"

# Backup existing Caddyfile
cp $CADDY_CONFIG ${CADDY_CONFIG}.backup

# Add Beds25 configuration
cat >> $CADDY_CONFIG << EOF

# Beds25 Booking System
$DOMAIN {
    reverse_proxy localhost:$APP_PORT
    encode gzip
    
    log {
        output file /var/log/caddy/beds25.log
    }
}
EOF

# Validate and reload Caddy
echo "🔍 Validating Caddy configuration..."
caddy validate --config $CADDY_CONFIG

echo "♻️  Reloading Caddy..."
systemctl reload caddy

echo ""
echo "✅ =================================="
echo "✅ Beds25 Setup Complete!"
echo "✅ =================================="
echo ""
echo "📋 Next Steps:"
echo "  1. Edit .env file:"
echo "     nano /var/www/beds25/.env"
echo ""
echo "  2. Add your Zoho CRM credentials"
echo ""
echo "  3. Restart the application:"
echo "     pm2 restart beds25"
echo ""
echo "  4. Set up GitHub Secrets in repository:"
echo "     - VPS_IP: 46.202.129.30"
echo "     - SSH_PRIVATE_KEY: (generate SSH key for beds25 user)"
echo ""
echo "  5. Update DOMAIN in this script and re-run Caddy config"
echo ""
echo "🌐 Application will be available at: https://$DOMAIN"
echo "📊 Monitor with: pm2 logs beds25"
echo "🔄 Auto-deploy enabled via GitHub Actions"

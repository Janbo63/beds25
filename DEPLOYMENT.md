# Deployment Guide - Beds25 Booking System

## Quick Start Options

Choose the deployment method that matches your infrastructure:

### Option 1: VPS Deployment (Recommended for Custom Server)
Best for: DigitalOcean, Hetzner, Linode, AWS EC2, etc.

### Option 2: Cloud Platform (Easiest)
Best for: Quick deployment without server management

### Option 3: Shared Hosting
Best for: cPanel or similar hosting

---

## Option 1: VPS Deployment with GitHub Auto-Deploy

### Prerequisites
- Ubuntu 20.04+ or similar Linux VPS
- SSH access
- Domain name pointed to server
- Sudo access

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install Git
sudo apt install -y git
```

### Step 2: Clone Repository

```bash
# Create app directory
sudo mkdir -p /var/www/beds25
sudo chown $USER:$USER /var/www/beds25

# Clone your repository
cd /var/www/beds25
git clone https://github.com/YOUR_USERNAME/Beds25.git .
```

### Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env
```

Add your Zoho CRM credentials to `.env`

### Step 4: Install and Build

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Initialize database
npx prisma db push

# Build for production
npm run build
```

### Step 5: Start with PM2

```bash
# Start application
pm2 start npm --name "beds25" -- start

# Save PM2 process list
pm2 save

# Set PM2 to start on boot
pm2 startup
# Run the command it outputs
```

### Step 6: Configure Nginx

Create `/etc/nginx/sites-available/beds25`:

```nginx
server {
    listen 80;
    server_name bookings.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/beds25 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 7: SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d bookings.yourdomain.com
```

### Step 8: GitHub Auto-Deploy Setup

Create deployment script at `/var/www/beds25/deploy.sh`:

```bash
#!/bin/bash
cd /var/www/beds25

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Rebuild
npm run build

# Restart PM2
pm2 restart beds25

echo "Deployment complete!"
```

Make it executable:

```bash
chmod +x deploy.sh
```

#### Option A: Manual Deploy (Run when you push to GitHub)
```bash
cd /var/www/beds25
./deploy.sh
```

#### Option B: GitHub Webhook (Auto-deploy on push)

1. Install webhook listener:
```bash
npm install -g github-webhook-handler
```

2. Create webhook server (see GitHub Actions section below for better alternative)

---

## Option 2: Cloud Platform Deployment

### Vercel (Easiest)

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables in dashboard
5. Deploy!

**Note**: You'll need to adjust for production database (use PostgreSQL via Vercel Postgres or external provider)

### Railway

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select your repository
4. Add environment variables
5. Deploy

---

## GitHub Actions Auto-Deploy (Best for VPS)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to server
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.SERVER_HOST }}
        username: ${{ secrets.SERVER_USER }}
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          cd /var/www/beds25
          git pull origin main
          npm install
          npm run build
          pm2 restart bells25
```

### Setup GitHub Secrets:
1. Go to repository → Settings → Secrets and variables → Actions
2. Add:
   - `SERVER_HOST`: Your server IP
   - `SERVER_USER`: SSH username
   - `SSH_PRIVATE_KEY`: Your SSH private key

---

## Post-Deployment Checklist

- [ ] Environment variables configured
- [ ] Database initialized
- [ ] Zoho CRM credentials tested
- [ ] SSL certificate installed
- [ ] PM2 process running
- [ ] Nginx configured
- [ ] Auto-deploy tested
- [ ] Backup strategy in place

---

## Maintenance

### View Logs
```bash
pm2 logs beds25
```

### Restart App
```bash
pm2 restart beds25
```

### Update App
```bash
cd /var/www/beds25
./deploy.sh
```

### Backup Database
```bash
cp /var/www/beds25/prisma/dev.db /backups/beds25-$(date +%Y%m%d).db
```

---

## Troubleshooting

### App won't start
```bash
pm2 logs beds25
# Check for errors
```

### Nginx errors
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

### Database issues
```bash
cd /var/www/beds25
npx prisma db push
```

## Need Help?

Contact your system administrator or refer to:
- Next.js deployment docs
- PM2 documentation
- Nginx guides

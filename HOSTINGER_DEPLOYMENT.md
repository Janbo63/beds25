# Hostinger VPS Deployment Guide - Beds25

## Server Details
- **IP**: 46.202.129.30
- **Hostname**: srv640385
- **OS**: Ubuntu 24.04.3 LTS
- **Web Server**: Caddy (ports 80, 443)
- **Process Manager**: PM2
- **Application Port**: 3003 (to avoid conflicts with existing apps)

## Initial Setup (One-Time)

### Step 1: SSH into Server

```bash
ssh root@46.202.129.30
```

### Step 2: Run Setup Script

```bash
# Download and run the setup script
curl -o setup.sh https://raw.githubusercontent.com/Janbo63/beds25/main/scripts/hostinger-setup.sh
chmod +x setup.sh
sudo ./setup.sh
```

This script will:
- ✅ Create `beds25` user
- ✅ Clone repository to `/var/www/beds25`
- ✅ Install dependencies
- ✅ Build the application  
- ✅ Configure PM2
- ✅ Update Caddy for your domain

### Step 3: Configure Environment

```bash
nano /var/www/beds25/.env
```

Add your actual credentials:
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`

Then restart:
```bash
pm2 restart beds25
```

### Step 4: Choose Your Domain

The application needs a domain or subdomain. Options:

**Option A: Use existing domain**
- `bookings.zagrodaalpakoterapii.com`
- `beds25.futuresolutionstestbed.eu`

**Option B: New subdomain**
- Point DNS A record to `46.202.129.30`

Update the domain in `/etc/caddy/Caddyfile`:
```bash
nano /etc/caddy/Caddyfile
```

Find the Beds25 section and replace `bookings.yourdomain.com` with your actual domain.

Then reload Caddy:
```bash
systemctl reload caddy
```

---

## GitHub Auto-Deploy Setup

### Step 1: Create SSH Key for beds25 User

On the server:
```bash
# Switch to beds25 user
su - beds25

# Generate SSH key
ssh-keygen -t ed25519 -C "beds25-deploy" -f ~/.ssh/deploy_key -N ""

# Display the private key
cat ~/.ssh/deploy_key
```

**Copy the entire private key** (including `-----BEGIN` and `-----END` lines)

### Step 2: Add GitHub Secrets

1. Go to: https://github.com/Janbo63/beds25/settings/secrets/actions
2. Click **"New repository secret"**
3. Add these secrets:

| Name | Value |
|------|-------|
| `VPS_IP` | `46.202.129.30` |
| `SSH_PRIVATE_KEY` | (paste the private key from above) |

### Step 3: Test Auto-Deploy

```bash
# On your local machine
cd "F:\Git Hub Projects\Beds25"
git add .
git commit -m "Test auto-deploy"
git push origin main
```

Watch the deployment:
- GitHub: https://github.com/Janbo63/beds25/actions
- Server: `ssh beds25@46.202.129.30 "pm2 logs beds25"`

---

## Application Management

### View Logs
```bash
pm2 logs beds25
```

### Restart Application
```bash
pm2 restart beds25
```

### Check Status
```bash
pm2 status
```

### View Caddy Logs
```bash
tail -f /var/log/caddy/beds25.log
```

---

## Port Allocation

Current Hostinger VPS ports:
- **3000**: zagrodalive (Production)
- **3001**: ZAPnew (Staging/Docker)
- **3002**: Future Solutions API
- **3003**: **Beds25** ← Your new app
- **3100**: MS365 MCP Server
- **3200**: Raj Okazji Upload API
- **5000**: Messenger Bot

---

## Troubleshooting

### Application won't start
```bash
cd /var/www/beds25
pm2 logs beds25 --lines 100
```

### Port already in use
Check what's using port 3003:
```bash
lsof -i :3003
```

### Database issues
```bash
cd /var/www/beds25
npx prisma db push
pm2 restart beds25
```

### Caddy configuration error
```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl status caddy
```

---

## Manual Deployment (Fallback)

If GitHub Actions fails, deploy manually:

```bash
ssh beds25@46.202.129.30
cd /var/www/beds25
git pull origin main
npm install
npm run build
pm2 restart beds25
```

---

## Security Notes

- SSH key authentication only (passwords disabled)
- Caddy automatically manages SSL/TLS certificates
- `.env` file is excluded from Git
- Application runs as dedicated `beds25` user (not root)

---

## What Domain Should I Use?

Let me know which domain/subdomain you'd like to use, and I'll update the configuration files accordingly!

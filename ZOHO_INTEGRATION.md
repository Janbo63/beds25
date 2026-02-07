# Zoho CRM Integration Guide

## Overview

Your booking system is now fully integrated with **Zoho CRM**. All bookings, rooms, and settings are stored in Zoho CRM as the source of truth, providing:

- ✅ **Centralized Customer Data** - All contact information accessible across your business
- ✅ **CRM Workflows** - Leverage Zoho's automation and email campaigns
- ✅ **Fast Dashboard Performance** - Local cache ensures instant load times
- ✅ **Data Integrity** - Single source of truth prevents conflicts

---

## Architecture

### Hybrid Sync Strategy

**Write Operations** (Create, Update, Delete):
```
User Action → Zoho CRM (Primary) → Local Database (Cache)
```

**Read Operations** (Dashboard, Reports):
```
Local Database (Fast) ← Sync Process ← Zoho CRM
```

---

## Setup Instructions

### 1. Create Zoho CRM Custom Modules

Log into your Zoho CRM account and create these custom modules:

#### **Bookings Module**
Fields (as you've already created):
- `Guest` (Lookup → Contacts)
- `Room` (Lookup → Rooms)
- `Check_In` (Date)
- `Check_Out` (Date)
- `Total_Price` (Currency)
- `Number_of_Adults` (Number)
- `Number_of_Children` (Number)
- `Guest_Ages` (Multi Line)
- `Booking_Notes` (Multi Line)

✅ **Already created in your Zoho CRM!**

#### **Rooms Module**
Fields (as you've already created):
- `Room_Name` (Single Line)
- `Base_Price` (Currency)
- `Capacity` (Number)
- `Max_Adults` (Number)
- `Max_Children` (Number)
- `Min_Nights` (Number)

✅ **Already created in your Zoho CRM!**

### 2. Get API Credentials

1. Go to **Zoho API Console**: https://api-console.zoho.com/
2. Create a new **Server-based Application**
3. Note your:
   - Client ID
   - Client Secret
4. Generate a **Refresh Token** with scopes:
   - `ZohoCRM.modules.ALL`
   - `ZohoCRM.settings.ALL`

### 3. Configure Environment Variables

Update your `.env` file:

```bash
ZOHO_CLIENT_ID="your_client_id_here"
ZOHO_CLIENT_SECRET="your_client_secret_here"
ZOHO_REFRESH_TOKEN="your_refresh_token_here"
ZOHO_DOMAIN=".com"  # or .eu for European data center
ZOHO_ACCOUNTS_URL="https://accounts.zoho.com"
ZOHO_API_DOMAIN="https://www.zohoapis.com"
```

### 4. Initial Data Sync

Once configured, go to **Settings → Zoho CRM** in your dashboard and click:
- **🔄 Sync All** - Sync both bookings and rooms
- **📅 Sync Bookings** - Sync only bookings
- **🏠 Sync Rooms** - Sync only rooms

---

## How It Works

### Creating a Booking

```typescript
// When a user creates a booking via the dashboard:
1. System validates room constraints (capacity, min nights)
2. Booking is created in Zoho CRM
3. Zoho returns the new booking ID
4. Booking is synced to local database with Zoho ID
5. Dashboard displays the new booking instantly
```

### Updating Room Details

```typescript
// When you edit room constraints in settings:
1. Update is sent to Zoho CRM
2. Zoho CRM is updated first
3. Local database is updated with new values
4. Changes are immediately visible in the dashboard
```

---

## API Endpoints

### Manual Sync
```bash
POST /api/admin/zoho-sync?entity=all
POST /api/admin/zoho-sync?entity=bookings
POST /api/admin/zoho-sync?entity=rooms
```

### Bookings (Zoho-backed)
```bash
POST /api/bookings          # Creates in Zoho, then local DB
PATCH /api/bookings         # Updates in Zoho, then local DB
```

### Rooms (Zoho-backed)
```bash
POST /api/admin/rooms       # Creates in Zoho, then local DB
PATCH /api/admin/rooms      # Updates in Zoho, then local DB
DELETE /api/admin/rooms     # Deletes from Zoho, then local DB
```

---

## File Structure

```
src/
├── lib/
│   ├── zoho.ts              # Zoho CRM API client (OAuth, CRUD)
│   └── zoho-service.ts      # Business logic & data mapping
├── app/
│   └── api/
│       ├── bookings/
│       │   └── route.ts     # ✅ Uses Zoho service
│       └── admin/
│           ├── rooms/
│           │   └── route.ts # ✅ Uses Zoho service
│           └── zoho-sync/
│               └── route.ts # Manual sync endpoint
```

---

## Troubleshooting

### "Zoho token refresh failed"
- Check that your `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` are correct
- Ensure your `ZOHO_REFRESH_TOKEN` is valid
- Verify your `ZOHO_ACCOUNTS_URL` matches your data center (`.com` or `.eu`)

### "Sync failed"
- Ensure custom modules are created in Zoho CRM
- Check that field names match exactly (case-sensitive)
- Verify API scopes include `ZohoCRM.modules.ALL`

### Data out of sync
- Run manual sync from **Settings → Zoho CRM → Sync All**
- Check Zoho CRM directly to verify data exists
- Review server logs for API errors

---

## Benefits

1. **Contact Management**: All guest emails automatically flow into your CRM
2. **Automation**: Set up Zoho workflows (e.g., send confirmation emails)
3. **Reporting**: Use Zoho's analytics across all business data
4. **Scalability**: CRM-first architecture ready for future integrations
5. **Performance**: Local cache ensures dashboard remains lightning-fast

---

## Next Steps

- [ ] Configure Zoho CRM modules
- [ ] Add API credentials to `.env`
- [ ] Run initial sync
- [ ] Test booking creation
- [ ] Set up Zoho workflows (optional)

**Need help?** Contact your system administrator or refer to Zoho CRM documentation.

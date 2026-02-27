# Beds25 - Booking Management System

Staff-facing booking management system for Zagroda Alpakoterapii, integrated with Zoho CRM, Beds24 channel manager, and Stripe payments.

**Live URL**: `https://admin.zagrodaalpakoterapii.com`

## Features

- 📅 **Tape Chart Calendar** — Interactive room availability view
- 🏨 **Room Management** — Rooms synced from Beds24 with full attribute data
- 💳 **Stripe Payments** — Deposit collection + automated balance charges
- 👥 **Guest Management** — Integrated with Zoho CRM Contacts
- 📊 **Reports & Campaigns** — Occupancy, revenue, and marketing dashboards
- 🔄 **Channel Integration** — Beds24 (Booking.com, Airbnb), iCal sync
- 🔐 **PIN Authentication** — Cookie-based admin sessions (30-day expiry)

## Tech Stack

- **Framework**: Next.js 16, React, TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (via Prisma ORM)
- **Authentication**: PIN + JWT cookie sessions (`jose`)
- **APIs**: Zoho CRM v6, Beds24 API v2, Stripe API
- **Hosting**: Hostinger VPS, PM2, Caddy (auto-SSL)
- **CI/CD**: GitHub Actions → auto-deploy on push to `main`

## Authentication

Admin access uses a **6-digit PIN** with **30-day session cookies**.

- Login page: `/login`
- Session cookie: `beds25_session` (HttpOnly, Secure, SameSite=Strict)
- No external OAuth providers or SSO required

### Route Protection

| Route Pattern | Auth Required | Purpose |
|---|---|---|
| `/login` | No | PIN login page |
| `/api/public/*` | No | Booking widget APIs |
| `/api/webhooks/*` | No | Stripe/Beds24 webhooks |
| `/api/cron/*` | No | Scheduled jobs |
| `/api/auth/*` | No | Login/logout endpoints |
| `/dashboard/*` | **Yes** | Admin dashboard pages |
| `/api/admin/*` | **Yes** | Admin API endpoints |
| `/api/dashboard/*` | **Yes** | Dashboard data APIs |

## Public API Reference

All public APIs are CORS-enabled for `zagrodaalpakoterapii.com` and `admin.zagrodaalpakoterapii.com`.

### GET /api/public/rooms

Returns all rooms with full attribute data.

**Response fields per room:**

| Field | Type | Source | Description |
|---|---|---|---|
| `id` | string | DB | Room ID |
| `name` | string | Beds24 | Room name |
| `number` | string | Beds24 | Room number/label |
| `description` | string | Beds24 texts | Room description |
| `roomType` | string | Beds24 | e.g. `apartment`, `double`, `suite` |
| `capacity` | int | Beds24 maxPeople | Total capacity |
| `maxAdults` | int | Beds24 maxAdult | Max adult guests |
| `maxChildren` | int | Beds24 maxChildren | Max child guests |
| `maxOccupancy` | int | Beds24 maxPeople | Max total guests |
| `minNights` | int | Beds24 minStay | Minimum stay |
| `maxStay` | int | Beds24 maxStay | Maximum stay |
| `size` | float | Beds24 roomSize | Room size |
| `sizeUnit` | string | Default: `sqm` | Size unit |
| `quantity` | int | Beds24 qty | Number of units |
| `basePrice` | float | Beds24 minPrice | Starting price |
| `rackRate` | float | Beds24 | Published rate |
| `cleaningFee` | float | Beds24 | Cleaning fee |
| `securityDeposit` | float | Beds24 | Security deposit |
| `bedConfig` | json | DB | Bed configuration |
| `amenities` | json | Beds24 featureCodes | Feature/amenity codes |
| `viewType` | string | DB | Room view type |
| `sortOrder` | int | Beds24 sellPriority | Display priority |
| `media` | array | DB | Room images |

### GET /api/public/availability

**Query params**: `checkIn`, `checkOut` (YYYY-MM-DD), `propertyId` (optional)

Returns available rooms with calculated pricing for the date range. Includes all room fields above plus:

| Field | Type | Description |
|---|---|---|
| `pricing.nights` | int | Number of nights |
| `pricing.totalPrice` | float | Total price (PLN) |
| `pricing.averagePerNight` | float | Average nightly rate |
| `pricing.nightlyBreakdown` | array | Price per date |

### POST /api/public/booking/create

Creates a new booking. See route file for payload schema.

### POST /api/public/voucher/validate

Validates a voucher/discount code.

### GET /api/public/property/images

Returns property-level media gallery.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | SQLite path (`file:./dev.db`) | Yes |
| `ADMIN_PIN` | 6-digit login PIN | Yes |
| `JWT_SECRET` | JWT signing secret (use `openssl rand -hex 32`) | Yes |
| `ZOHO_CLIENT_ID` | Zoho OAuth Client ID | Yes |
| `ZOHO_CLIENT_SECRET` | Zoho OAuth Client Secret | Yes |
| `ZOHO_REFRESH_TOKEN` | Zoho OAuth Refresh Token | Yes |
| `ZOHO_DOMAIN` | `.com` or `.eu` | Yes |
| `ZOHO_ACCOUNTS_URL` | Zoho accounts URL | Yes |
| `ZOHO_API_DOMAIN` | Zoho API domain | Yes |
| `ALPACA_SITE_API_KEY` | API key for alpaca site calls | Yes |

## Data Flow

```
Beds24 API v2 ──→ importBeds24Data() ──→ SQLite (Prisma)
                                              │
Zoho CRM ←──── mapRoomToZoho() ←──────────────┤
                                              │
Public APIs ←── /api/public/* ←───────────────┤
                                              │
Dashboard ←──── /dashboard/* ←────────────────┘
```

**Beds24 is the source of truth** for room attributes. Data flows:
1. Beds24 → local DB (via import/sync)
2. Local DB → Zoho CRM (via push)
3. Local DB → Public APIs (for booking widget)
4. Local DB → Dashboard (for staff)

## Deployment

**Production**: Hostinger VPS via GitHub Actions.

- App directory: `/var/www/beds25`
- Port: `3003`
- PM2 process: `beds25`
- Caddy: `admin.zagrodaalpakoterapii.com` → `127.0.0.1:3003`
- Deploy: Push to `main` triggers auto-deploy

See [HOSTINGER_DEPLOYMENT.md](./HOSTINGER_DEPLOYMENT.md) for full VPS setup.

## Project Structure

```
Beds25/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── admin/        # Protected admin endpoints
│   │   │   ├── auth/         # Login/logout
│   │   │   ├── cron/         # Scheduled jobs
│   │   │   ├── dashboard/    # Dashboard data APIs
│   │   │   ├── public/       # Public booking APIs
│   │   │   └── webhooks/     # Stripe/Beds24 webhooks
│   │   ├── dashboard/        # Admin dashboard pages
│   │   └── login/            # PIN login page
│   ├── components/           # React components
│   ├── lib/
│   │   ├── auth.ts           # JWT session utilities
│   │   ├── beds24.ts         # Beds24 API client + import
│   │   ├── cors.ts           # CORS configuration
│   │   ├── prisma.ts         # Prisma client
│   │   ├── zoho.ts           # Zoho API client
│   │   └── zoho-service.ts   # Zoho service layer
│   └── middleware.ts         # Auth middleware (cookie check)
├── prisma/
│   └── schema.prisma         # Database schema
├── scripts/                  # Diagnostic/utility scripts
├── tests/                    # Playwright E2E tests
└── .github/workflows/        # CI/CD pipeline
```

## License

Proprietary — All rights reserved. FutureSolutions.

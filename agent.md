# Beds25 — Booking System with Zoho CRM Integration

> Internal admin tool for managing room bookings, pricing, availability, and channel sync.
> Inherits global standards from `~/.gemini/GEMINI.md`.

## Project Context

Beds25 is a **staff-facing booking management system** — not a customer-facing website. It gives your workers a frontend to:
- View and manage bookings across all channels (Airbnb, Booking.com, direct)
- Set room pricing and availability via an interactive tape chart calendar
- Manage guest records synced bidirectionally with Zoho CRM
- Handle voucher codes and multi-property support

### Architecture & The Booking Triad Contract
> **Beds24 is the Master PMS (Headquarters)**. Unidirectional flow prevents duplicate "ghost" bookings.
- **Source of truth for reservations, pricing, and calendar blocks**: Beds24 API v2.
- **Availability Rule**: **No price explicitly set in Beds24 = Date is blocked/unavailable**. Never fallback to a default price.
- **Beds25 Role**: Staff-facing management dashboard and Zoho CRM synchronization engine.
- **Sync Direction**: Beds24 (Master) → Webhook (`/api/webhooks/beds24`) → Local SQLite Cache → Zoho CRM (Deals + Contacts).
- **Website Bookings**: Customer checkout on the website injects directly into Beds24 (`/bookings`, source `WEBSITE`). Beds24 webhooks propagate the reservation into Beds25 and Zoho.
- **Authentication**: PIN-based login with JWT cookie sessions (30-day expiry, HttpOnly) — *planned migration to Google OAuth NextAuth v5 per global standards*.

## Key Decisions

- **Unidirectional Flow (Beds24 as Master)** — Prevents infinite sync loops and ghost booking duplicates. All official reservation modifications, cancellations, and blackout blocks flow from Beds24 down.
- **Zoho CRM as Enterprise Record** — Synchronized via webhook ingestion to ensure all booking records empower marketing automations, guest history, and reporting.
- **SQLite as Fast Local Cache** — Eliminates slow Zoho API latency during dashboard browsing and tape chart views.
- **Multi-property model** — Organization → Property → Room → Booking hierarchy.
- **Voucher system** — `VoucherCode` + `VoucherRedemption` models for promo codes with constraints.

## Tech Stack

- **Framework**: Next.js 16 + React + TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (Prisma ORM) + Zoho CRM REST API v6
- **Auth**: `jose` JWT + HttpOnly cookies (PIN login)
- **APIs**: Beds24 API v2, Zoho CRM v6, Stripe
- **Deployment**: Hostinger VPS, port 3003, PM2 process
- **CI/CD**: GitHub Actions (repo: `Janbo63/beds25`)
- **Domain**: `admin.zagrodaalpakoterapii.com` (Caddy reverse proxy → port 3003)

## Zoho CRM Modules

| Module | Type | Key Fields |
|---|---|---|
| **Contacts** | Standard | Guest records |
| **Bookings** | Custom | Guest, Room, Check_In, Check_Out, Total_Price, Status, Source |
| **Rooms** | Custom | Room_Name, Base_Price, Capacity, Max_Adults, Min_Nights |
| **Vouchers** | Custom | Code, discount type/value, validity, usage limits |
| **Booking Admins** | Custom | Property-level admin/owner records |

## Current State

- ✅ Core booking CRUD (create, update via Zoho)
- ✅ Room management with Beds24 attribute sync (13 enriched fields)
- ✅ PIN-based admin auth (cookie sessions, 30-day expiry)
- ✅ iCal sync for Airbnb/Booking.com
- ✅ Guest management linked to Zoho Contacts
- ✅ Pricing rules (per-date overrides)
- ✅ Channel settings (commission multipliers)
- ✅ Voucher code system
- ✅ Stripe payments (deposit + balance charges)
- ✅ Admin subdomain: `admin.zagrodaalpakoterapii.com`
- ✅ PM2 deployment to Hostinger (port 3003)
- ✅ GitHub Actions CI/CD pipeline
- ⬜ Zoho room push: `mapRoomToZoho` needs new fields
- ⬜ Playwright tests: need updating for cookie auth (currently skipped in CI)

## Cross-Project Links

- **Alpaca Farm Website** (`zagrodaalpakterapii.com`): Will eventually rewrite its public booking frontend to integrate with the same Zoho backend. The `zoho-service.ts` patterns from Beds25 will be reused.
- **Zoho Integration project**: Schema decisions (Organization, Property, VoucherCode models) were designed in that conversation and implemented here.

## Known Gotchas

### Zoho API
- Zoho field names are **case-sensitive** — `Check_In` not `check_in`
- Zoho OAuth tokens expire — handle `401 Unauthorized` with token refresh
- In CI, Zoho credentials are set to `dummy` — all Zoho API calls must be guarded with `if (process.env.ZOHO_CLIENT_ID !== 'dummy')` to avoid CI failures

### Database
- SQLite locks on concurrent writes — only one write operation at a time
- In CI, use `prisma db push --accept-data-loss` to avoid interactive prompts
- CI uses `file:./ci.db` (ephemeral) — never the production `dev.db`

### Deployment (Hostinger VPS)
- **PM2 processes are per-user** — root's PM2 list is invisible to the `beds25` user. The CI deploys as `beds25` but PM2 was started by `root`. Use `pm2 restart beds25` as root after deploy.
- **git safe.directory** — when the repo dir is owned by a different user, git refuses to operate. Fix: `git config --global --add safe.directory /var/www/beds25` for both `root` and `beds25` users.
- **File ownership** — if `root` runs `npm run build`, the `.next/` directory becomes root-owned. The `beds25` user cannot overwrite it during CI deploy. Fix: `chown -R beds25:beds25 /var/www/beds25`
- **Port conflicts** — always use `fuser -k 3003/tcp` before starting a new process if the previous one didn't shut down cleanly. Zombie Node processes can hold ports.
- **PM2 start command** — do NOT use `PORT=3003 pm2 start npm -- start`. The PORT env var isn't reliably passed through. Instead: `pm2 start node_modules/.bin/next --name "beds25" -- start -p 3003`

### i18n / next-intl
- Next.js 16 deprecated `middleware.ts` in favor of `proxy` — avoid `createMiddleware` from `next-intl` as it blocks server startup in CI
- Language switching sets `NEXT_LOCALE` cookie and calls `router.refresh()` — server components must use `getTranslations()` from `next-intl/server`
- iCal imports can have timezone issues (always normalize to `Europe/Warsaw`)

## Key Files

| File | Purpose |
|---|---|
| `src/lib/auth.ts` | JWT session utilities (PIN validation, cookie management) |
| `src/lib/beds24.ts` | Beds24 API client + room attribute import |
| `src/lib/zoho.ts` | Zoho API client (OAuth, HTTP, token refresh) |
| `src/lib/zoho-service.ts` | Business logic, data mapping, sync orchestration |
| `src/lib/cors.ts` | CORS config (admin.*, bookings.*, localhost) |
| `src/lib/prisma.ts` | Prisma client singleton |
| `src/middleware.ts` | Auth middleware (cookie session check) |
| `src/app/login/page.tsx` | PIN login page (iPad-friendly) |
| `prisma/schema.prisma` | 10+ models including enriched Room fields |
| `scripts/inspect-beds24-rooms.js` | Diagnostic: raw Beds24 API room data |

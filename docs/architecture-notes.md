# Beds25 — Architecture notes

Lasting project knowledge moved here from the former `agent.md` on 2026-10-24, when the repo adopted the Project Standard. Items marked *(unverified)* came from the old file and have not been re-checked against the code.

## Architecture

- Follows the Booking Triad contract: Beds24 is the master PMS. Sync runs Beds24 → webhook (`/api/webhooks/beds24`) → local SQLite cache → Zoho CRM.
- **SQLite as a fast local cache** avoids slow Zoho API latency on dashboards and the tape chart.
- **Multi-property model**: Organization → Property → Room → Booking.
- **Voucher system**: `VoucherCode` + `VoucherRedemption` models for promo codes with constraints.

## Tech stack

Next.js 16 + React + TypeScript · Tailwind CSS · SQLite via Prisma + Zoho CRM REST v6 · Beds24 API v2 · Stripe · Auth via `next-auth` (`src/lib/auth.ts`). The old notes described PIN + `jose` JWT login; the code now imports `next-auth`, so confirm which login flow is live.

## Zoho CRM modules

| Module | Type | Key fields |
|---|---|---|
| Contacts | Standard | Guest records |
| Bookings | Custom | Guest, Room, Check_In, Check_Out, Total_Price, Status, Source |
| Rooms | Custom | Room_Name, Base_Price, Capacity, Max_Adults, Min_Nights |
| Vouchers | Custom | Code, discount type/value, validity, usage limits |
| Booking Admins | Custom | Property-level admin/owner records |

## Gotchas

### Zoho API
- Field names are case-sensitive: `Check_In`, not `check_in`.
- OAuth tokens expire: handle `401 Unauthorized` with a token refresh.
- CI uses `dummy` credentials: guard every call with `if (process.env.ZOHO_CLIENT_ID !== 'dummy')`.
- `Payment_Date` expects `YYYY-MM-DD`, not an ISO datetime (commit `5196695`).

### Database
- SQLite locks on concurrent writes; one write at a time.
- CI: `prisma db push --accept-data-loss` against ephemeral `file:./ci.db`, never production `dev.db`.

### Deployment (Hostinger)
- Port 3003 · PM2 process `beds25` · OS user `beds25` (not root) · Caddy → `admin.zagrodaalpakoterapii.com`.
- Full guardrails: `F:\Senior Management\contracts.md` §4.

### i18n / next-intl
- Avoid `createMiddleware` from `next-intl` on Next.js 16 (blocks CI server startup).
- Language switching sets the `NEXT_LOCALE` cookie and calls `router.refresh()`; server components use `getTranslations()` from `next-intl/server`.
- Normalise iCal dates to `Europe/Warsaw`.

## Key files

| File | Purpose |
|---|---|
| `src/lib/auth.ts` | Auth configuration (now `next-auth`) |
| `src/lib/beds24.ts` | Beds24 API client + room attribute import |
| `src/lib/zoho.ts` | Zoho API client (OAuth, HTTP, token refresh) |
| `src/lib/zoho-service.ts` | Business logic, data mapping, sync orchestration |
| `src/lib/cors.ts` | CORS config (admin.*, bookings.*, localhost) |
| `src/lib/prisma.ts` | Prisma client singleton |
| `src/lib/stef-logger.ts` | Error reporting to Stef (`STEF_LOG_KEY` from env only) |
| `src/middleware.ts` | Route protection |
| `prisma/schema.prisma` | 10+ models including enriched Room fields |
| `scripts/inspect-beds24-rooms.js` | Diagnostic: raw Beds24 room data |

## Cross-project links

- The Zagroda public site is planned to reuse the `zoho-service.ts` patterns for its booking frontend *(unverified)*.
- Schema decisions (Organization, Property, VoucherCode) came from the Zoho integration work.

# Beds25 — Booking System with Zoho CRM Integration

> Internal admin tool for managing room bookings, pricing, availability, and channel sync.
> Inherits global standards from `~/.gemini/GEMINI.md`.

## Project Context

Beds25 is a **staff-facing booking management system** — not a customer-facing website. It gives your workers a frontend to:
- View and manage bookings across all channels (Airbnb, Booking.com, direct)
- Set room pricing and availability via an interactive tape chart calendar
- Manage guest records synced bidirectionally with Zoho CRM
- Handle voucher codes and multi-property support

### Architecture
- **Source of truth**: Zoho CRM (custom Bookings, Rooms, Vouchers, and Booking Admins modules)
- **Local cache**: SQLite via Prisma — for fast dashboard reads
- **Sync strategy**: Writes go to Zoho first, then local DB. Reads come from local cache.

## Key Decisions

- **Zoho CRM as source of truth** — chosen over a standalone DB because all booking data needs to flow into the broader CRM for marketing, automation, and reporting
- **SQLite as cache, not primary** — Zoho API is too slow for dashboard UX, so we cache locally and sync
- **Hybrid sync** — write-through to Zoho, periodic pull for reads. Manual sync endpoint as fallback
- **Multi-property model** — Organization → Property → Room → Booking hierarchy, ready for multi-tenant
- **Voucher system** — `VoucherCode` + `VoucherRedemption` models for promo codes with constraints

## Tech Stack

- **Framework**: Next.js 16 + React + TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (Prisma ORM) + Zoho CRM REST API v6
- **Deployment**: Hostinger VPS, port 3003, PM2 process
- **CI/CD**: GitHub Actions (repo: `Janbo63/beds25`)
- **Domain**: TBD — options: `bookings.zagrodaalpakoterapii.com` or `beds25.futuresolutionstestbed.eu`

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
- ✅ Room management with constraints
- ✅ iCal sync for Airbnb/Booking.com
- ✅ Guest management linked to Zoho Contacts
- ✅ Pricing rules (per-date overrides)
- ✅ Channel settings (commission multipliers)
- ✅ Voucher code system
- ✅ PM2 deployment to Hostinger (port 3003)
- ✅ GitHub Actions CI/CD pipeline
- ⬜ Domain assignment (bookings subdomain pending)
- ⬜ Production Zoho API keys (currently using test credentials)

## Cross-Project Links

- **Alpaca Farm Website** (`zagrodaalpakterapii.com`): Will eventually rewrite its public booking frontend to integrate with the same Zoho backend. The `zoho-service.ts` patterns from Beds25 will be reused.
- **Zoho Integration project**: Schema decisions (Organization, Property, VoucherCode models) were designed in that conversation and implemented here.

## Known Gotchas

- Zoho field names are **case-sensitive** — `Check_In` not `check_in`
- Zoho OAuth tokens expire — handle `401 Unauthorized` with token refresh
- SQLite locks on concurrent writes — only one write operation at a time
- iCal imports can have timezone issues (always normalize to `Europe/Warsaw`)

## Key Files

| File | Purpose |
|---|---|
| `src/lib/zoho.ts` | Zoho API client (OAuth, HTTP, token refresh) |
| `src/lib/zoho-service.ts` | Business logic, data mapping, sync orchestration |
| `src/lib/prisma.ts` | Prisma client singleton |
| `src/lib/ical-import.ts` | iCal feed import + parse |
| `prisma/schema.prisma` | 10 models: Organization, Property, Room, Guest, Booking, PriceRule, IcalSync, ChannelSettings, VoucherCode, VoucherRedemption |
| `scripts/hostinger-setup.sh` | One-time server provisioning |
| `ecosystem.config.js` | PM2 process configuration |

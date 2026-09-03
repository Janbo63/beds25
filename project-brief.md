# Beds25 — Project Brief

## One-Liner
> Staff-facing booking management dashboard with Zoho CRM synchronisation.

## Business Case
**Why does this exist?** Workers need a streamlined frontend to manage bookings across all channels (Airbnb, Booking.com, direct) without logging into Beds24's complex, error-prone native UI.
**Who benefits?** Farm staff (frictionless daily operations and calendar management), Jan (accurate reporting and oversight), Zoho ecosystem (real-time synchronized customer and booking data).
**Revenue model**: Cost reducer — saves staff time, prevents costly booking errors or ghost reservations, and enables automated CRM-driven marketing.

## Value Proposition
An administrative control layer engineered specifically for farm operations over Beds24 and Zoho CRM. Uses a fast local SQLite cache to eliminate third-party API latency during daily operations, presents an intuitive visual tape chart calendar for multi-room management, and strictly enforces unidirectional sync integrity (Beds24 → Beds25 → Zoho CRM) to eliminate double-booking risks.

## Strategic Alignment
- **Theme**: 🏠 Hospitality & Tourism (see [objectives.md](file:///F:/Senior%20Management/objectives.md))
- **Priority Tier**: 🔴 Tier 1 — Revenue Infrastructure (see [portfolio-decisions.md](file:///F:/Senior%20Management/portfolio-decisions.md))
- **Dependencies**: Beds24 API v2 (master PMS), Zoho CRM v6 (enterprise record), Zagroda website (booking injection)

## Targets & KPIs

### Q4 2026
| Metric | Baseline | Target | How to Measure |
|---|---|---|---|
| Booking sync errors/month | Unknown | 0 | Error logs on Stef Dashboard + Beds24 webhook failure reports |
| Staff adoption | Partial | Daily active use (100%) | Daily user activity logs on admin dashboard |
| Zoho CRM sync latency | Variable (>15 min) | <5 minutes | Timestamp difference between Beds24 webhook arrival and Zoho CRM record upsert |
| Tape chart accuracy | ~90% | 100% room display & status | Visual audit against Beds24 calendar across all room types |

### 12-Month Vision
A fully automated sync pipeline with zero manual data entry, automated guest follow-up workflows triggered via Zoho CRM, automated Stripe balance charge collection, and multi-property operational capability.

## Cost & Resources
- **Infrastructure**: Hostinger VPS port 3003, PM2 process `beds25`, SQLite local cache, Caddy reverse proxy; domain: `admin.zagrodaalpakoterapii.com`
- **Monthly cost estimate**: ~$10/month Hostinger VPS share + Zoho CRM subscription
- **Agent time**: Weekly (bug fixes, sync performance improvements, tape chart maintenance)

## Dependencies
- **Master PMS**: Receives booking webhooks from Beds24 API v2 (`/api/webhooks/beds24`) as single source of truth per Booking Triad Contract in [contracts.md](file:///F:/Senior%20Management/contracts.md).
- **Public Frontend**: Serves availability verification and voucher code validation to [Zagroda_adoption](file:///F:/Git%20Hub%20Projects/Zagroda_adoption/).
- **Enterprise CRM**: Upserts contacts, bookings, and voucher redemptions into Zoho CRM v6 (`Accounts.zoho.eu`, Org ID `20103978631`) per Zoho CRM Contract in [contracts.md](file:///F:/Senior%20Management/contracts.md).
- **Payments**: Integrates with Stripe API for deposit capture and automated remaining-balance charges.
- **Monitoring**: Emits non-blocking health and error telemetry to Stef Dashboard (`POST https://stef.futuresolutionsai.com/api/logs`) per Error Logging Contract in [contracts.md](file:///F:/Senior%20Management/contracts.md).

## Current Status
- **Last active**: 2026-08-24 (fix(sync): fix bookingService.update & delete creating duplicates with missing rooms in Zoho)
- **Next milestone**: Complete Zoho room attribute push (`mapRoomToZoho`), update Playwright tests for cookie authentication, and activate automated Stripe balance charges.

## Exit Criteria
Only if Beds24 builds an equivalent staff UI natively (highly unlikely given legacy roadmap) or if FutureSolutions transitions to a completely different PMS platform.

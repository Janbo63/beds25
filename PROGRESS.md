# Beds25 — Progress hand-off

Updated 2026-10-24 by Claude Opus (Robin). **Rewrite this file; do not append.** Keep it ≤ 40 lines.

## Current state

- In production on Hostinger (port 3003, `admin.zagrodaalpakoterapii.com`). I did not check it live this session.
- 2026-10-24 **deployed and verified live**: 6 unauthenticated one-off `fix-*` routes removed (now 404); `payment-overview` and `stripe-reconcile` moved behind the admin login (401 without a session); `GET /api/health` returns `{"ok":true,"db":"ok"}`. The CI quality gate passed on its first GitHub run (run 40111354915), and the post-deploy health check passed.
- Errors from the cron jobs and `zoho-service.ts` are reported to Stef.
- Auth: the code imports `next-auth`, but the old notes described PIN + `jose`. Confirm which login staff actually use.

## Definition of Done gaps

- Existing debt, now ratcheted (`quality-baseline.json`): **95 TypeScript errors, 183 ESLint errors** in `src`. The gate fails if either count rises. `next.config.ts` still has `ignoreBuildErrors: true`.
- No `test` script. Playwright tests exist in `tests/` but are not wired in.
- Remaining `/api/public/*` routes (availability, booking, rooms, voucher, property images) are intentionally public for the website. They need a review for input validation and rate limiting.
- Health endpoint not yet in Stef's `MONITORED_ENDPOINTS`. Dev port not registered.

## Active work

| Item | Status | Note |
|---|---|---|
| Stef log key in this public repo's history | closed 2026-10-24 | tested live: the leaked key is retired (401 for read and write); no rotation needed |
| Zoho room push: `mapRoomToZoho` needs new fields | open (from old notes) | not re-checked |

## Open decisions for Jan

- Confirmed by Jan 2026-10-24: logged-in admin (tape chart, bookings) works after the deploy.
- If anyone used the old `/api/public/payment-overview` link, it now requires login at `/api/admin/payment-overview`.

## Next action

1. Add `https://admin.zagrodaalpakoterapii.com/api/health` to Stef's `MONITORED_ENDPOINTS`.

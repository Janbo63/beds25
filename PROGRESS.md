# Beds25 — Progress hand-off

Updated 2026-10-24 by Claude Opus (Robin). **Rewrite this file; do not append.** Keep it ≤ 40 lines.

## Current state

- In production on Hostinger (port 3003, `admin.zagrodaalpakoterapii.com`). I did not check it live this session.
- 2026-10-24 (committed, **not pushed**): removed 6 unauthenticated one-off `fix-*` routes; moved `payment-overview` and `stripe-reconcile` behind the admin login (`/api/admin/`); added `GET /api/health`; added a CI quality gate and a post-deploy health check.
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
| Push + first CI run of the quality gate | waiting for Jan | the gate is untested on GitHub's Linux runner; watch the first run |
| Zoho room push: `mapRoomToZoho` needs new fields | open (from old notes) | not re-checked |

## Open decisions for Jan

- Push the 3 commits (`3452733` security, plus the pilot and gate commits). Recommendation: yes, in working hours, then watch Actions.
- If anyone used the old `/api/public/payment-overview` link, it now requires login at `/api/admin/payment-overview`.

## Next action

1. After the push: confirm the CI gate and health check pass, then add `https://admin.zagrodaalpakoterapii.com/api/health` to Stef's `MONITORED_ENDPOINTS`.

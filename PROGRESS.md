# Beds25 — Progress hand-off

Updated 2026-10-24 by Claude Opus (Robin). **Rewrite this file; do not append.** Keep it ≤ 40 lines.

## Current state

- In production on Hostinger (port 3003, `admin.zagrodaalpakoterapii.com`). I did not check it live this session.
- Last code changes: 2026-10-04 Stef log key read from env only; 2026-09-11 Dorota's activity booking and diary (`/activities`, public).
- Errors from the cron jobs (`charge-balances`, `retry-zoho-sync`) and `zoho-service.ts` are reported to Stef.
- Auth: the code imports `next-auth`, but the old notes described PIN + `jose`. Confirm which login staff actually use.

## Definition of Done gaps

- CI (`deploy.yml`) deploys on push to `main` **without** running lint, typecheck or tests first.
- No `typecheck` or `test` script in `package.json`. Playwright tests exist in `tests/` but are not wired in (previously "skipped in CI").
- No `GET /api/health` endpoint, so Stef can only ping the page.
- Dev port not registered (contract §7 forbids using 3003 for dev).

## Active work

| Item | Status | Note |
|---|---|---|
| Zoho room push: `mapRoomToZoho` needs the new fields | open (from old notes) | not re-checked |
| Playwright tests for the current auth | open | blocked by the auth question above |

## Open decisions for Jan

- Approve adding a CI quality gate (lint + typecheck + build) before the deploy step. This changes the production pipeline. Recommendation: yes.
- Approve adding `/api/health` and registering it in Stef's `MONITORED_ENDPOINTS`. Recommendation: yes; low risk.
- Choose a dev port in the 3000–3099 range (suggest 3013) to add to the registry.

## Next action

1. Add `typecheck` script + `/api/health` route, and a CI gate job before deploy (after Jan approves the pipeline change).

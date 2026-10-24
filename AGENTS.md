# Beds25 — Booking System with Zoho CRM Integration

> Follows the FutureSolutions Project Standard v1.0 — `F:\Senior Management\standards\README.md`.
> Read `PROGRESS.md` next. Keep this file ≤ 80 lines; detail belongs in `README.md` or `docs/`.

## 1. What this is

Staff-facing booking admin (not customer-facing): tape-chart calendar, pricing and availability, guests, vouchers, Stripe charges, and the Beds24 → Zoho CRM sync engine. Also hosts Dorota's alpaca activity bookings and diary (`/activities`).

## 2. Governance

- **Tier**: 1 — Revenue Infrastructure · **Autonomy**: Full Auto (commit, no push)
- **Owner persona**: Robin (Engineering), Kev (Operations)
- **Server / port / domain**: hostinger · 3003 · `admin.zagrodaalpakoterapii.com` · PM2 process `beds25`, owned by OS user `beds25` (not root)

## 3. Run it

| Task | Command |
|---|---|
| Dev | `npm run dev` (dev port not yet registered — see PROGRESS open decisions) |
| Lint / typecheck / test | `npm run lint` · *(no typecheck script yet)* · *(no test script yet; Playwright config in `playwright.config.ts`, tests in `tests/`)* |
| Build | `npm run build` |
| Deploy | Push to `main` triggers `.github/workflows/deploy.yml` (SSH deploy to Hostinger). Push only with Jan's approval. |

## 4. Where to look

1. `PROGRESS.md` — current state, DoD gaps, open decisions, next action
2. `docs/architecture-notes.md` — Zoho modules, key decisions, gotchas, key files
3. `project-brief.md` — business context and KPIs · `README.md` — setup
4. Key files: `src/lib/beds24.ts` (Beds24 client) · `src/lib/zoho.ts` + `src/lib/zoho-service.ts` (Zoho client and sync) · `src/lib/auth.ts` + `src/middleware.ts` (auth) · `src/lib/stef-logger.ts` · `prisma/schema.prisma`

## 5. Contracts this repo is bound by

In `F:\Senior Management\contracts.md`: §1 Booking Triad (Beds24 is master; sync is one-way Beds24 → SQLite → Zoho) · §2 Error Logging · §3 Authentication · §4 Deployment · §5 i18n · §6 Zoho CRM · §7 Port Hygiene · §8 PROGRESS.md reporting.

## 6. Project-specific rules and gotchas

- Zoho field names are case-sensitive (`Check_In`, not `check_in`). Guard every Zoho call with `if (process.env.ZOHO_CLIENT_ID !== 'dummy')` because CI uses dummy credentials.
- SQLite allows one writer at a time. CI uses an ephemeral `file:./ci.db` and `prisma db push --accept-data-loss`, never production `dev.db`.
- Next.js 16: do not use `createMiddleware` from `next-intl` (it blocks CI startup). Normalise iCal dates to `Europe/Warsaw`.
- Never create a bidirectional sync loop. No price in Beds24 means the date is unavailable.

## 7. Definition of Done

Every change meets `F:\Senior Management\standards\definition-of-done.md`. Before finishing a session: rewrite `PROGRESS.md`.

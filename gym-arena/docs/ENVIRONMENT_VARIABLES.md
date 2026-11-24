# Environment variables — single reference

Verified against the code: every `process.env` read in `src/`, `next.config.ts` and `scripts/`.
No other variable changes the app's behaviour. Values are never written here, in chat, in tickets
or in commits.

## 1. Read by the deployed app (set in the hosting provider)

| Variable | Read in | Purpose | Staging | Production | Secret | Configured in |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/env.ts`, `src/middleware.ts`, `next.config.ts` (CSP, at **build** time) | Supabase project address | required | required | no (public) | Vercel project → Environment Variables → Production scope |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/env.ts`, `src/middleware.ts` | Public API key; every request is limited by RLS | required | required | no (public by design) | Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/service.ts` (`server-only`) | Server-side reads/writes after the app has authorized the caller | required | required | **yes** | Vercel (Sensitive) |
| `SEASON_CLOSE_DATABASE_URL` | `src/modules/seasons/close.ts` (`server-only`, only reader) | Close transaction as the restricted role `arena_season_closer` (Transaction pooler, port 6543, user `arena_season_closer.<ref>`) | required | required | **yes** | Vercel (Sensitive) |
| `CRON_SECRET` | `src/app/api/cron/snapshot/route.ts` | Authorizes the daily snapshot job (`Authorization: Bearer`), ≥ 16 chars; different per environment | required | required | **yes** | Vercel (Sensitive); Vercel Cron sends it |
| `APP_ORIGIN` | `src/lib/origin.ts` | Address at the start of the TV link in Settings (nothing else) | optional (leave unset) | **required**: the final `https://` domain | no | Vercel |

Four more variables are read but never set by hand:
- **`NODE_ENV`** is read by `next.config.ts` and set by the platform. Next.js compiles it into the build, so it cannot be changed at runtime.
- **`NEXT_DIST_DIR`** is read by `next.config.ts`. It is a test-only build-output folder and must **never** be set in Vercel, which expects `.next`.
- **`VERCEL`** is read by `src/lib/supabase/cookie-security.ts`. Vercel sets it to `1` at build and runtime when system variables are exposed. It makes every auth cookie `Secure` without reading any request header.
- **`GITHUB_ACTIONS`** is read by the same file. GitHub Actions sets it to `true`. The CI cookie flag (§3) works only with it.

`APP_TIMEZONE` appears in `.env.example` but nothing reads it. Cairo time is fixed in `src/lib/time.ts`.

Only the two `NEXT_PUBLIC_` values reach the browser. The build attestation tests and a scan of
the client bundle show that no server secret appears there (`docs/STAGING_ACCEPTANCE_REPORT.md`).
`NEXT_PUBLIC_*` values are compiled into the bundle and into the CSP, so after changing them you must **Redeploy**.

## 2. Operator files: on your computer only, never in hosting

| File | Template | Used by |
|---|---|---|
| `.env.staging` | `.env.staging.example` | `npm run staging:*` |
| `.env.production-ops` | `.env.production-ops.example` | `npm run prod:*` |

Both names are git-ignored and are **not** loaded by `next build` / `next start`, unlike `.env.production`.

| Variable | Staging file | Production file | Secret | Purpose |
|---|---|---|---|---|
| `PRODUCTION_SUPABASE_REF` | required (the ref to **refuse**) | required (the ref you operate on) | no | Project identity for the isolation check |
| `STAGING_SUPABASE_REF` | — | required (the ref to **refuse**) | no | ″ |
| `PRODUCTION_APP_ORIGIN` / `STAGING_APP_ORIGIN` | optional | optional | no | Refuse the other environment's address |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEASON_CLOSE_DATABASE_URL`, `CRON_SECRET`, `APP_ORIGIN` | the staging values | the production values | as in §1 | The same values you put in that environment's hosting project |
| `STAGING_MIGRATION_DATABASE_URL` / `PRODUCTION_MIGRATION_DATABASE_URL` | Session pooler, user `postgres.<ref>`, port 5432 | ″ | **yes** | Owner connection for migrations, psql, backups. **Never in hosting.** |
| `ADMIN_EMAIL`, `ADMIN_NAME` | once | once | no | First admin. `ADMIN_PASSWORD` stays **empty**: the command asks for it twice and does not show it |

The isolation check (`scripts/staging-check.ts`, run first by every `staging:*` / `prod:*`
command) fails when any of the following is true:
- a value names the other environment's project;
- two values name different projects;
- the close connection is not the restricted role, or not the Transaction pooler (host `<region>.pooler.supabase.com`, port 6543);
- a URL carries `?host=`/`?user=` or several hosts;
- the shell overrides the file;
- the folder is linked to the other project.

In production it also requires `APP_ORIGIN` and `CRON_SECRET`.

## 3. Read only by tests and CI (never in hosting)
- **Test targets:** `TEST_DATABASE_URL`, `GYM_ARENA_TEST_STACK`, `GYM_ARENA_CI_DISPOSABLE`, `E2E_ALLOW_WRITES`.
- **Test build output:** `NEXT_DIST_DIR`.
- **Plain-HTTP auth cookies for the CI browser job:** `AUTH_COOKIES_ALLOW_LOCAL_HTTP=1`.
  - Set only on that job's `test:e2e` step, and read at runtime.
  - It works only inside GitHub Actions (`GITHUB_ACTIONS=true`), and only for plain-HTTP requests from this machine.
  - Without it, outside GitHub Actions, or on any Vercel deployment, auth cookies are always `Secure`.

The operator preflight refuses every one of these in `.env.staging` and `.env.production-ops`, so none can be copied into hosting.

These belong to the disposable CI stack (`tests/FIXTURES.md`).

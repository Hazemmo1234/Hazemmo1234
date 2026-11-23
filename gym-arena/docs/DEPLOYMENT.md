# Deployment configuration (manual steps)

Staging first: `docs/STAGING.md` sets up an isolated staging copy with the same steps, plus a
preflight (`npm run staging:preflight`) that proves no value points at production.

The application fails safely when any of these is missing; nothing here is created by code or CI.
Never commit values. Set them in the hosting provider's secret store.

| Variable | Scope | Required for | Behaviour when missing |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | everything | the app refuses to start a request ("Server misconfigured") |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | leaderboards, TV, staff creation, writes through server functions | those requests fail with an error; no data is exposed |
| `SEASON_CLOSE_DATABASE_URL` | server only | **closing a season** (D21, D27) | Close returns 503 "not set up"; nothing changes |
| `CRON_SECRET` (≥ 16 chars) | server only | the daily rank snapshot job | the job is refused (401); the first TV request of each day still writes the snapshot |
| `APP_ORIGIN` | server only, optional | only the address at the start of the TV link shown in Settings (`src/lib/origin.ts`); set it in production to the public domain if Settings may be opened from another address | the request's own host is used |
| `APP_TIMEZONE` | server | documentation only — Africa/Cairo is fixed in code | — |

## Season-close role (once per database)
1. On the cloud database, enable login for the restricted role created by the migrations, with a
   strong generated password (letters and digits only). Preferred, so the password never appears
   in a query history: in `psql` as the owner, `alter role arena_season_closer login;` then
   `\password arena_season_closer`. Without psql: `alter role arena_season_closer login password '<generated>';`
   in a new SQL Editor snippet, then delete the snippet.
2. Store `postgresql://arena_season_closer.<project-ref>:<password>@<transaction-pooler-host>:6543/postgres`
   as `SEASON_CLOSE_DATABASE_URL` (Supabase pooler; the direct `db.<ref>.supabase.co` address is
   IPv6-only and not reachable from the hosting platform). The close is one transaction on one
   connection with prepared statements disabled, so a transaction-mode pooler is correct.
3. The role can only read the season inputs and call `begin_season_close` / `finish_season_close`
   (SECURITY_SPECIFICATION §7).

## Daily snapshot job
`vercel.json` schedules `GET /api/cron/snapshot` daily at 22:05 UTC (00:05 or 01:05 Cairo). Vercel
Cron sends `Authorization: Bearer $CRON_SECRET`. Another scheduler can call the same route with
that header. The snapshot is computed from data dated before the Cairo day, so the run time does
not change the result.

## First admin
`npm run create-admin` with `ADMIN_EMAIL` and `ADMIN_NAME` set (scripts/create-admin.ts). Leave
`ADMIN_PASSWORD` unset: the script asks for it twice without showing it. Never type a password on
the command line (`ADMIN_PASSWORD=… npm run …`): it would stay in the shell history.

## After the first cloud deployment
Migrations become add-only (D22). Never run `db reset`, seed or push against a linked or cloud
database.

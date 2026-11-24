# Staging acceptance report

Single record of staging setup and acceptance. Procedure and expected results:
`docs/STAGING.md`. Only observed results are recorded. Nothing here is a secret: no keys,
passwords, connection strings, TV keys or screenshots showing them.

**Status legend:**
- **VERIFIED**: observed, with evidence.
- **NOT VERIFIED**: not yet observed.
- **NOT RUN**: not yet attempted.
- **BLOCKED**: cannot run yet (reason given).
- **REQUIRES OWNER**: needs the owner's account, computer or presence.
- **REQUIRES APPROVAL**: waits for the owner's explicit go.
- **PASS** / **FAIL**: outcome of an executed acceptance step.

Production: **never touched**. This work has not created, read or changed any production
deployment, secret, database, role, account or record. Claude has no access to the owner's
Supabase or Vercel accounts or computer. Every cloud step below is performed by the owner, and
each gate is passed only on the owner's explicit approval.

---

## 1. Environment

| Item | Value | Status |
|---|---|---|
| Release branch | `claude/ecstatic-goodall-3p1zte` | VERIFIED |
| Verified commit (code + CI) | `42d6491` (see §2) | VERIFIED |
| Staging Supabase project ref | — | REQUIRES OWNER (A1) |
| Production Supabase ref (comparison only) | — | REQUIRES OWNER (A1) |
| Staging Vercel project | `gym-arena-staging`, not yet created | REQUIRES OWNER (A9) |
| Staging deployment URL / deployed commit | — | BLOCKED until A10 |
| Migrations on staging (8 expected) | — | REQUIRES APPROVAL (Gate 1) |
| Close role on staging | — | REQUIRES APPROVAL (Gate 2) |
| Staging admin account | — | REQUIRES APPROVAL (Gate 3) |
| Staging deployment | — | REQUIRES APPROVAL (Gate 4) |

## 2. Commit and CI evidence

Later verified commit: `8d97f02` (self-hosted fonts):
- [push #53](https://github.com/Hazemmo1234/Hazemmo1234/actions/runs/45279307146) and [PR #54](https://github.com/Hazemmo1234/Hazemmo1234/actions/runs/45279319272) both succeeded on all four jobs.
- 774/774 unit tests, DB suite passed, build passed, E2E 128 passed with 108 device-project skips.
- The build needs no network.

Each later commit's evidence is reported with that commit; see `docs/RELEASE_HISTORY.md`.

### `42d6491`

| Run | Lint, typecheck, unit + coverage | DB / RLS / security | Production build | E2E | Conclusion |
|---|---|---|---|---|---|
| [push #49](https://github.com/Hazemmo1234/Hazemmo1234/actions/runs/45275180912) | success (769/769 tests) | success (119/119) | success | success (128 passed, 108 skipped by project design) | **success** |
| [pull_request #50](https://github.com/Hazemmo1234/Hazemmo1234/actions/runs/45275195070) | success (769/769) | success (119/119) | success | success (128 passed, 108 skipped) | **success** |

Skipped E2E tests are the ones written for the other device project (phone vs. TV); none is skipped for failing.

Local checks on `42d6491`, all **VERIFIED**:
- `npm run lint`: clean.
- `npm run typecheck`: clean.
- `npm run test:coverage`: 28 files, 769 tests passed. Totals: statements 98.06 %, branches 95.55 %, functions 96.02 %, lines 98 %. The `scripts/staging-check.ts` and `scripts/staging-verify-core.ts` files: 100 % lines.
- `npm run build`: success.

Repository hygiene, all **VERIFIED**:
- Working tree clean; local equal to origin; `6386f33` and `0bb34ca` in history.
- No secrets in tracked files or in history (`git grep` / `git log -p --all`):
  - no JWTs;
  - no `sb_secret_` or `sb_publishable_` keys;
  - no private keys;
  - no cloud project refs;
  - no non-local database URLs with passwords.
- Only `.env.example` and `.env.staging.example` were ever committed. `.env.staging` and `.env.local` are git-ignored.
- PR #1 is unchanged: additive only (files under `gym-arena/` plus `.github/workflows/gym-arena-ci.yml`); not merged, retargeted or edited.

## 3. Safety validation — VERIFIED

### 3.1 Environment variables the code reads (`grep process.env` over `src/` and `next.config.ts`)

| Variable | Read in | Required | Staging value from | Configured in |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/env.ts`, `src/middleware.ts`, `next.config.ts` (CSP, at build) | yes | staging API settings | Vercel gym-arena-staging, Production env |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/env.ts`, `src/middleware.ts` | yes | staging API keys (public by design) | Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/service.ts` (`server-only`) | yes | staging API keys | Vercel |
| `SEASON_CLOSE_DATABASE_URL` | `src/modules/seasons/close.ts` (`server-only`; the only reader) | yes | staging Transaction pooler, role `arena_season_closer` | Vercel |
| `CRON_SECRET` | `src/app/api/cron/snapshot/route.ts` | yes for staging | new random value, staging only | Vercel |
| `APP_ORIGIN` | `src/lib/origin.ts` (TV link address only) | optional in staging; **required in production** (`prod:preflight`) | unset | not set |
| `NODE_ENV` | `next.config.ts` | — | platform | never set by hand |
| `NEXT_DIST_DIR` | `next.config.ts` (test-only build folder; default `.next`) | — | — | never set (Vercel expects `.next`) |
| `VERCEL` | `src/lib/supabase/cookie-security.ts` (auth cookies always Secure) | — | platform (Vercel system variable) | never set by hand |
| `AUTH_COOKIES_ALLOW_LOCAL_HTTP` | `src/lib/supabase/cookie-security.ts` (test-only; works only with `GITHUB_ACTIONS=true`) | — | — | never set (the preflight refuses it) |
| `GITHUB_ACTIONS` | `src/lib/supabase/cookie-security.ts` | — | platform (GitHub Actions) | never set by hand |

**Five or six?** The app reads six configuration variables. Staging sets five of them, because `APP_ORIGIN` is optional in staging and stays unset (production requires it).

Other notes:
- Only two names start with `NEXT_PUBLIC_`: the project URL and the anon key, both public by design.
- The preflight refuses a secret-format key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`, in both the legacy and the new format.
- `APP_TIMEZONE` is not read by any code; Cairo is fixed in `src/lib/time.ts`.
- The owner database URL (`STAGING_MIGRATION_DATABASE_URL`) exists only in `.env.staging` on the owner's computer, never in hosting.

### 3.2 Operator scripts: negative-case matrix
Fake values, stubbed `npx`/`psql`, no network:

| # | Case | Result |
|---|---|---|
| 01–04 | valid fake staging config: preflight / migrate dry run / migrate `--apply` / psql | exit 0. The CLI gets `--remote=<url> --skip-vault`, plus `--dry-run` unless `--apply` is given. psql gets the checked staging host. |
| 05 | no `.env.staging` | refused |
| 06–07 | production ref missing / malformed | refused |
| 08–10 | Supabase URL = production / malformed / missing | refused |
| 11 | anon key from another project | refused |
| 12 | production service key, via `staging:create-admin` | refused before the script runs |
| 13 | secret key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`, both formats | refused |
| 14–17 | migration URL: production / other project / `?host=` override / two hosts | refused |
| 18 | migration URL missing (`staging:migrate`) | refused |
| 19–22 | close URL: as owner / production / `?user=` override / missing | refused |
| 23 | `CRON_SECRET` under 16 characters | refused |
| 24–25 | shell exports a different `NEXT_PUBLIC_SUPABASE_URL` than the file | refused |
| 26 | shell `PGHOSTADDR` / `PGSERVICE` set | stripped before psql/CLI start |
| 27 | CLI folder linked to production | refused |
| 28 | production ref hidden in another value | refused |

Every refusal exits 1 before any external call. The output never contained any fake secret. Unit tests: `tests/unit/staging-check.test.ts` (12) and `tests/unit/staging-verify.test.ts` (6).

### 3.3 Migration script (`scripts/staging-migrate.ts`)
- Requires `STAGING_MIGRATION_DATABASE_URL` and a passing preflight.
- Uses an explicit `--remote=<url>`, never the CLI link or a default database.
- Dry run by default; applies only with `--apply`.
- Never seeds. `supabase/seed.sql` also aborts on any non-local database.
- Removes inherited `PG*` variables.

Known limitation: during the run, the URL is an argument of the Supabase CLI process, visible in your own computer's process list. It is not printed and not logged by the script.

### 3.4 Admin creation (`scripts/create-admin.ts`, `staging:create-admin`)
What it does:
- Runs the preflight first.
- Uses only the preflight-checked URL and key.
- With `ADMIN_PASSWORD` empty, asks for the password twice without echo, then requires a match and at least 10 characters.
- Prints only `Admin created: <email>`.
- Refuses when an admin already exists, or when the existing-admin count cannot be read. Before `42d6491`, an unreadable count was treated as zero.
- Rolls back the auth user if creating the profile fails.

Checked on a pseudo-terminal:
- Typed characters are not shown.
- Mismatched passwords: "differ — nothing was created".
- Unreachable database: clean refusal.
- No terminal and no password: refusal.

### 3.5 Where a secret could end up — checked

| Place | Finding |
|---|---|
| Git-tracked files / history | none (scan above) |
| Console output of the staging scripts | none: only names, project refs and status codes. Checked with fake secrets in all 28 cases. |
| Application logs | the only server log line prints an error **code** (`src/modules/seasons/close.ts:39`), never a URL or message |
| Shell history | the staging commands take no secret arguments. Fixed in this stage: the usage comment in `scripts/create-admin.ts` and the "First admin" text in `docs/DEPLOYMENT.md` showed `ADMIN_PASSWORD=… npm run …`, which leaves the password in shell history; both now say to let the script ask. psql `\password` sends a hash and stores no password in `~/.psql_history`. |
| Temporary files | the staging scripts write no files |
| Supabase SQL Editor route | `ALTER ROLE … PASSWORD '…'` is plain SQL and may be recorded in the database logs. STAGING.md prefers `staging:psql` with `\password`, and says to delete the snippet if the editor is used. |
| At rest | `.env.staging` on your computer holds the staging service key and database URLs. Keep it there only; delete it, or at least the `STAGING_MIGRATION_DATABASE_URL` line, when staging work is finished. |
| This report | holds project refs and outcomes only |

### 3.6 `staging:verify` (read-only)

Prerequisites: the deployed staging address (A10) and a `.env.staging` that passes the preflight. Status: **NOT RUN**, because no deployment exists yet.

It refuses the production address (`PRODUCTION_APP_ORIGIN`), then runs the preflight. After that it sends only GET requests, with `redirect: manual`:

| Check | Expected |
|---|---|
| `/login` | HTTP 200 |
| Deployed CSP | names **only** the staging ref. `next.config.ts` builds it from `NEXT_PUBLIC_SUPABASE_URL` at build time. |
| `/api/tv/state` without a key and with a wrong key | 401 |
| `/api/cron/snapshot` without the secret | 401 |
| `/api/me` without a session | 401 |
| Supabase `/auth/v1/settings` | `disable_signup = true` |
| Anonymous REST reads on members, profiles, entries, attendance, season_results, app_settings, audit_log | refused |

It writes nothing:
- The TV route rejects a wrong key before reading any state (`src/app/api/tv/state/route.ts:16-17`); the daily snapshot is written only behind a valid key.
- The cron route rejects before any work.
- The anon key is sent only to the preflight-checked staging Supabase URL; nothing secret is sent to the site.

A unit test asserts that every request is a GET and that no key appears in the output.

### 3.7 Restricted close role `arena_season_closer`
Source: `supabase/migrations/20261114000003_rls_and_storage.sql:116-137`.

What the role is:
- Created `NOLOGIN NOINHERIT`.
- Defaults: no superuser, create-role, create-db, replication or bypass-RLS.

What it can do:
- `USAGE` on `public`.
- `SELECT` on seasons, season_participants, members, entries, attendance (RLS read policies).
- `EXECUTE` only on `begin_season_close`, `finish_season_close` and `app_today`. All other functions are revoked from `PUBLIC` (`:32-33`).

What the close functions check:
- An active admin actor.
- The season lock.
- Not already closed.
- Ended.
- Every participant gets exactly one result.

The CI suite (`tests/db/seasons.test.ts:317-344`, 119/119 on `42d6491`) proves the role is denied:
- writing results, seasons, entries or audit;
- reading profiles, the TV key, the audit log or `auth.users`;
- calling server write functions;
- creating tables.

No other role can call the close functions.

Inherent trust (D21/D27): the password allows closing an *ended* season with results the caller computes. It belongs only in the hosting secret store.

Staging-side checks (STAGING.md step 5): **NOT RUN**.

### 3.8 Focused security review (VERIFIED, behaviour tests)

| Area | Verified behaviour | Evidence |
|---|---|---|
| API authorization | **Every** exported handler of every API route (38 handlers, 28 routes) is called. Signed out, each protected one answers **401 before reading any table**. An active coach gets **403 from every admin-only handler**, after reading only their own profile, and passes the role gate on the 17 coach handlers. An inactive profile counts as signed out. The service-role client is never touched. Mutation-tested: removing a guard, opening an admin route to coaches, or reading data before the guard each fails the test. | `tests/unit/api-guards.test.ts` |
| Public endpoints | **TV state:** a missing, empty, wrong or one-character-short key → 401, with no board data and no state built. **Cron:** no secret configured, no header, a wrong or truncated secret, a missing `Bearer`, or a too-short configured secret → 401, and the service role is not touched. **Locale:** returns only `{locale}`; strict schema; signed out it reads and writes nothing; signed in it updates only the caller's own `profiles.locale`. | same file |
| Auth cookies | **Always `Secure`, unless the SERVER's own configuration allows local plain HTTP AND the request comes plainly from this machine.** Server configuration means `next dev`, or the test-only flag `AUTH_COOKIES_ALLOW_LOCAL_HTTP=1`, which works only inside GitHub Actions (`GITHUB_ACTIONS=true`). On a Vercel deployment (`VERCEL=1`) cookies are always Secure and no request header is read. Any other production build is Secure as well, because `NODE_ENV=production` is compiled in. **Correction (2026-11-24):** up to and including `b6b7b90`, the middleware judged the request by `request.nextUrl`. On a self-hosted server (`next dev`, `next start`: local development and CI only) that is always the server's own address, so whenever the exception was enabled, *every* request lost Secure: forged or remote hosts, and LAN clients in dev mode. Production and staging were never affected. Now the request headers decide, and they can only remove the exception: a non-loopback Host, a differing `X-Forwarded-Host`, an `X-Forwarded-Proto` other than `http`, a non-loopback `X-Forwarded-For`/`X-Real-IP`, or any `Forwarded` header keeps Secure. The earlier claim that headers "can only narrow" the exception was false for the middleware and is now true. The browser client uses the page's real address (`window.location`). `SameSite=Lax`, `path=/`. The real `@supabase/ssr` writes our setting into `sb-<ref>-auth-token`; all three clients pass it. The preflight refuses the test-only flag in operator files. `httpOnly` stays false because `@supabase/ssr` reads the session in the browser (accepted; HSTS and CSP mitigate it). **Real-server check (CI):** the production build and `next dev` are started once per configuration, and the Set-Cookie they actually send is checked. The old code fails 8 of its 16 cases; the fix passes all 16. **Not yet proven on a deployment:** CI runs over plain HTTP and cannot show the attribute on Vercel's HTTPS. That is staging step 45 and stays NOT VERIFIED until it is observed. | `src/lib/supabase/cookie-security.ts`, `tests/unit/auth-cookies.test.ts`, `tests/integration/auth-cookies.server.test.ts`, `.github/workflows/gym-arena-ci.yml` |
| Audit records | Only trigger-called `public.audit()` writes them. No API role may call it or insert into `audit_log`; the app only reads it. Settings and profile rows are never logged whole; the key rotation is logged as `null, null, null`. The E2E checks that neither the old nor the new key appears in the rotation's audit row. | `tests/unit/audit-sql.test.ts`, `e2e/m6-admin.spec.ts`, DB suite |
| Service role | Only in `server-only` modules and the cron route, after the app has authorized the caller | `grep createServiceClient`; api-guards test |
| RLS | Every table has RLS; the only `using (true)` policies are the close role's read policies; behaviour is covered by the DB suite (119 tests) | migrations; `tests/db/*` |
| Close role | Least privilege (§3.7) | `tests/db/seasons.test.ts:317-344` |
| Secrets in client bundle | None | build attestation tests; bundle scan |
| CSP | `script-src 'unsafe-inline'` (Next.js bootstrap without nonces). Accepted risk; no other script origin | `next.config.ts` |
| Rate limiting | None in the app. Sign-in uses Supabase Auth's own limits. The TV key has 192 bits; the cron secret is at least 16 characters | — |

### 3.9 Production-target operator tooling (VERIFIED locally; never run against real infrastructure)

The `prod:*` commands (preflight, migrate, psql, backup, create-admin, verify) use
`.env.production-ops`. That file is git-ignored and not loaded by Next.js.

In production mode:
- every value must name the declared `PRODUCTION_SUPABASE_REF`;
- `STAGING_SUPABASE_REF` must appear nowhere;
- `APP_ORIGIN` and `CRON_SECRET` are required;
- `migrate --apply`, psql and create-admin require typing the production ref, and refuse without a terminal.

Target selection:
- `--target=production` or `--target=staging`;
- any other value, or a repeated flag, stops the command;
- each target compares against its own operator file, so a cross-wired file fails.

`scripts/create-admin.ts` enforces its target itself, however it is started:
- `local` refuses any non-local URL;
- `staging` and `production` run the preflight;
- production also needs the typed ref.

Tests: `tests/unit/staging-check.test.ts`, 22 tests, including production values run as staging, staging values run as production, and target parsing.

No-network smoke matrix with fake values and stubbed `npx`/`psql`/`pg_dump`, 12 cases:
- the right command on the wrong file is refused;
- a typo target is refused;
- a cloud URL through plain `create-admin` is refused;
- production admin creation without a terminal is refused;
- production admin creation with the wrong typed ref changes nothing;
- the verify address of the other environment is refused;
- backups pass only the checked host;
- no secret appeared in any output.

## 4. Setup execution (STAGING.md §0)

| Step | Status | Evidence to share (no secrets) |
|---|---|---|
| A1 Supabase staging project | REQUIRES OWNER | the two refs (not secret) |
| A2 sign-up off, password ≥ 10 | REQUIRES OWNER | confirmed later by A11 |
| A3 `.env.staging` | REQUIRES OWNER | — |
| A4 `npm run staging:preflight` | REQUIRES OWNER | full output |
| A5 `npm run staging:migrate` (dry run) | REQUIRES OWNER | full output |
| **Gate 1** apply migrations | REQUIRES APPROVAL | |
| A6 `--apply` + post-migration checks | NOT RUN | output + 9 counts |
| **Gate 2** enable close role | REQUIRES APPROVAL | |
| A7 role login + 9 role checks | NOT RUN | true/false results |
| **Gate 3** create admin | REQUIRES APPROVAL | |
| A8 `npm run staging:create-admin` | NOT RUN | `Admin created: …` line |
| A9 Vercel project and 5 variables | REQUIRES OWNER | project name, branch, root directory |
| **Gate 4** deploy staging | REQUIRES APPROVAL | |
| A10 deployment | NOT RUN | status, commit, address |
| A11 `npm run staging:verify -- <url>` | NOT RUN | full output |

## 5. Acceptance checklist (STAGING.md §2)

| Step | Expected (short) | Actual | Status |
|---|---|---|---|
| 1–5 | Smoke 2020 closes, "0 final results frozen"; one audit record; repeat POST → 409 | | NOT RUN |
| 6–8 | Settings save; masked link, copy/open; 360 px layout | | NOT RUN |
| 9–12 | 2 coaches, 6 members; preseason D1 active; championship D2 scheduled with 6 participants | | NOT RUN |
| 13–18 | Coaches see only own clients; baselines; cross-coach and admin pages refused; TV preseason count 4 | | NOT RUN |
| 19–26 | Preseason closed (no results/reveal); photo rule; coach undo; admin correction needs reason, audited; Delta inactive | | NOT RUN |
| 27 | **Alpha 310 · Bravo 117 · Foxtrot 33 · Echo 0**; Rookies **Charlie 37**; Delta absent | | NOT RUN |
| 28 | TV live = staff leaderboard | | NOT RUN |
| 29, 35 | TV "Results coming soon", no standings (D33) | | NOT RUN |
| 30–31 | 6 frozen results; winners Alpha/Bravo/Foxtrot; Echo 4th; Charlie rookie; Delta not ranked, 12 | | NOT RUN |
| 32–34 | Closed: no Correct/Void; one close audit; repeat → 409; coach history | | NOT RUN |
| 36–37 | Reveal Foxtrot → Bravo → Alpha → podium; reload resumes | | NOT RUN |
| 38 | Rotation: old link "Display not authorized"; new link works | | NOT RUN |
| 39 | Cron 200 daily; no header → 401 | | NOT RUN |
| 40–45 | Wrong password refused; coach 403 on close and key rotation; TV payload allow-list; rotation audit without key; Wi-Fi loss recovers; auth cookie Secure + SameSite=Lax on HTTPS | | NOT RUN |

On any FAIL: record the actual result, then fix only a real defect, with a regression test, and re-run.
Expected scores and rules are never changed to make a step pass.

## 6. Security summary

| Area | Status |
|---|---|
| Preflight isolation | VERIFIED locally (§3.2); on real staging values NOT RUN (A4) |
| Restricted role | VERIFIED in CI (§3.7); staging checks NOT RUN (A7) |
| RLS / anonymous access denied | VERIFIED in CI; on staging NOT RUN (A6 counts, A11) |
| Sign-up disabled | NOT VERIFIED (A11) |
| TV privacy allow-list | VERIFIED in CI (`e2e/tv.spec.ts`); step 42 NOT RUN |
| TV key rotation, key-free audit | VERIFIED in CI and code (`rules_and_triggers.sql:664-665`); steps 38 and 43 NOT RUN |
| Auth cookies `Secure` | Decision and wiring: unit tests. Real servers (production build, Vercel flag, CI and dev configurations): CI real-server check (§3.8). On the HTTPS deployment: NOT VERIFIED (step 45) |

## 7. Operational readiness

| Item | Status |
|---|---|
| Real phone (iOS/Android), LAUNCH_ACCEPTANCE §4 | REQUIRES OWNER, NOT RUN |
| Physical gym TV, TV_TEST_CHECKLIST | REQUIRES OWNER, NOT RUN |
| Coach onboarding (COACH_GUIDE + 45-min agenda) | REQUIRES OWNER, NOT RUN; material ready |
| Daily job (cron) | NOT RUN (step 39) |

## 8. Open issues

| Issue | Severity | Impact | Owner / action | Blocks production? |
|---|---|---|---|---|
| Staging not yet created | — | no acceptance evidence yet | Owner: §0 A1–A3 | yes |
| Vercel builds on every push without waiting for CI | medium | a broken commit could reach **staging** before CI fails | Accepted for staging. Production deploys only from `release/gym-arena`, advanced to a CI-green SHA (`PRODUCTION_RUNBOOK.md` §3) | no, given the release gate |
| No branch protection on either branch | medium | the release branch could be pushed without checks | Owner: protect `release/gym-arena` (and the default branch) and require the 4 CI checks | recommended before production |
| Vercel Hobby is non-commercial only; Supabase Free has no backups and can pause | decision | terms and data safety | Owner: Pro plans for production (`PRODUCTION_RUNBOOK.md` §1) | yes (decision) |
| GitHub Actions warns that `actions/*@v4` run Node 20 (forced to 24) | low | warning only; jobs pass | Update action versions when convenient | no |
| New-format `sb_…` keys cannot be tied to a project by the preflight | low | relies on copying from the right page | Prefer legacy keys if offered (STAGING.md step 2) | no |
| Migration URL visible in the local process list during `staging:migrate` | low | local only, own computer | accepted; not logged | no |
| PR #1 title/body still say "M0 foundation" | low | confusing history | Owner decision; edit only with approval | no |
| PR #1 merge vs. production from the branch | decision | which branch production builds from | Owner decision | yes (before production) |

## 9. Production readiness gate (all open)
Each item needs to be verified or explicitly accepted:
- [ ] Staging isolation proven.
- [ ] Migrations applied.
- [ ] Close role verified.
- [ ] Close acceptance passed.
- [ ] Frozen results verified.
- [ ] Reveal passed.
- [ ] TV privacy and rotation passed.
- [ ] Security checks passed.
- [ ] Real phone checked or risk accepted.
- [ ] Physical TV checked or risk accepted.
- [ ] Coach onboarding done or scheduled.
- [ ] Production configuration reviewed independently.
- [ ] `APP_ORIGIN` set to the production domain.
- [ ] Backup and rollback plan reviewed.
- [ ] PR #1 decision made.
- [ ] Owner's explicit production authorization.

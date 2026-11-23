# Staging acceptance report

Single record of staging setup and acceptance. Procedure and expected results:
`docs/STAGING.md`. Only observed results are recorded. Nothing here is a secret: no keys,
passwords, connection strings, TV keys or screenshots showing them.

**Status legend:**
- **VERIFIED**: observed, with evidence.
- **NOT RUN**: not yet attempted.
- **BLOCKED**: cannot run yet (reason given).
- **REQUIRES OWNER**: needs the owner's account or presence.
- **REQUIRES APPROVAL**: waits for explicit authorization.
- **PASS** / **FAIL**: outcome of an executed acceptance step.

Production: **never touched**. No production deployment, secret, database, role, account or record
has been created, read or changed by this work.

---

## 1. Environment

| Item | Value | Status |
|---|---|---|
| Release branch | `claude/ecstatic-goodall-3p1zte` | VERIFIED |
| Release commit under acceptance | see §2 (latest green commit on the branch) | VERIFIED |
| Staging Supabase project ref | — (owner creates the project) | REQUIRES OWNER |
| Production Supabase project ref (comparison only) | — | REQUIRES OWNER |
| Staging Vercel project | `gym-arena-staging` (to be created) | REQUIRES OWNER |
| Staging deployment URL | — | BLOCKED (no project yet) |
| Deployed commit | — | BLOCKED |
| Migrations on staging (8 expected) | — | REQUIRES APPROVAL (after dry run) |
| Restricted close role on staging | — | REQUIRES APPROVAL |
| Staging admin account | — | REQUIRES APPROVAL |

## 2. Baseline (Phase 0) — 2026-11-23

| Check | Result | Status |
|---|---|---|
| Branch / working tree | `claude/ecstatic-goodall-3p1zte`; clean; local = origin | VERIFIED |
| `6386f33` in history | yes (ancestor of HEAD) | VERIFIED |
| CI on the latest commit | 4 jobs (lint/typecheck/unit+coverage, build, DB/RLS, E2E), push and PR runs | VERIFIED per commit in the handoff message |
| Secrets in tracked files | none: no JWTs, no `sb_secret_`/`sb_publishable_` keys, no private keys, no cloud project refs, no non-local DB URLs with passwords | VERIFIED (`git grep`) |
| Secrets in history | none: same scan over `git log -p --all` returned 0 matches; only `.env.example` and `.env.staging.example` were ever committed | VERIFIED |
| Local env files | `.env.local` (git-ignored; local stack only, host 127.0.0.1); no `.env.staging` yet | VERIFIED (names and host class only, no values read out) |

## 3. Safety validation (Phase 1) — 2026-11-23

### 3.1 Environment variables the code reads
`grep process.env` over `src/` and `next.config.ts`:

| Variable | Read in | Required | Staging value from | Hosting |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/env.ts`, `src/middleware.ts`, `next.config.ts` (CSP) | yes | staging API settings | Vercel (Production env of gym-arena-staging) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/env.ts`, `src/middleware.ts` | yes | staging API settings (public by design) | Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/service.ts` (`server-only`) | yes | staging API settings | Vercel |
| `SEASON_CLOSE_DATABASE_URL` | `src/modules/seasons/close.ts` (`server-only`, the only user) | yes | staging transaction pooler, role `arena_season_closer` | Vercel |
| `CRON_SECRET` | `src/app/api/cron/snapshot/route.ts` | yes for staging | new random value | Vercel |
| `APP_ORIGIN` | `src/lib/origin.ts` (TV link address only) | optional | unset | not set |
| `NODE_ENV` | `next.config.ts` | — | platform | never set by hand |
| `NEXT_DIST_DIR` | `next.config.ts` (test build folder) | — | — | never set |

**Five or six?** The app reads six variables. Staging sets five of them, because `APP_ORIGIN` is optional and stays unset.
- Only two names start with `NEXT_PUBLIC_`: the project URL and the anon key, both public by design.
- The preflight refuses a secret-format key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `APP_TIMEZONE` appears in `.env.example`, but the code never reads it.

### 3.2 Operator scripts: negative-case matrix (fake values, stubbed CLI/psql, no network)

| # | Case | Result |
|---|---|---|
| 01–04 | valid fake staging config: preflight / migrate dry run / migrate `--apply` / psql | exit 0; CLI called with `--remote=<url> --skip-vault` (+`--dry-run` unless `--apply`); psql gets the staging pooler host |
| 05 | no `.env.staging` | refused |
| 06–07 | production ref missing / malformed | refused |
| 08–10 | Supabase URL = production / malformed / missing | refused |
| 11 | anon key from another project | refused |
| 12 | production service key (via `staging:create-admin`) | refused before the script runs |
| 13 | secret key in `NEXT_PUBLIC_SUPABASE_ANON_KEY` (new and legacy formats) | refused |
| 14–17 | migration URL production / other project / `?host=` override / two hosts | refused |
| 18 | migration URL missing (`staging:migrate`) | refused |
| 19–22 | close URL as owner / production / `?user=` override / missing | refused |
| 23 | `CRON_SECRET` too short | refused |
| 24–25 | shell exports a different `NEXT_PUBLIC_SUPABASE_URL` than the file | refused ("your shell exports a different value") |
| 26 | shell `PGHOSTADDR`/`PGSERVICE` set (psql) | stripped; psql reaches only the checked host |
| 27 | CLI folder linked to production | refused |
| 28 | production ref hidden in another value | refused |

In every case: exit code 1 on refusal, no external call, and zero occurrences of any fake secret in
the output.

Unit tests:
- `tests/unit/staging-check.test.ts`: 12 tests.
- `tests/unit/staging-verify.test.ts`: 6 tests.

### 3.3 Admin creation
- `staging:create-admin` runs the preflight first (`&&`).
- It uses only the preflight-checked URL and key.
- It asks for the password twice with no echo when `ADMIN_PASSWORD` is empty, so the password is never written to disk.
- It prints only the email.
- It refuses when an admin already exists or the account count cannot be read.

Checked on a pseudo-terminal: mismatched passwords create nothing, an unreachable database fails cleanly, and with no terminal and no password it refuses. **VERIFIED.**

### 3.4 Restricted close role `arena_season_closer`
Source: `supabase/migrations/20261114000003_rls_and_storage.sql:116-137`.

What the role is:
- Created `NOLOGIN NOINHERIT`.
- Defaults: no superuser, create-role, create-db, replication or bypass-RLS.

What it can do:
- `USAGE` on schema `public`.
- `SELECT` on seasons, season_participants, members, entries, attendance, through RLS read policies.
- `EXECUTE` on `begin_season_close`, `finish_season_close` and `app_today` only. Every other function is revoked from `PUBLIC` (`:32-33`).

What the close functions check (`20261114000002_rules_and_triggers.sql:787-880`):
- An active admin actor.
- The season lock.
- Not already closed.
- Ended.
- Completeness: every participant gets exactly one result.

Proven in CI (`tests/db/seasons.test.ts:317-344`): the role can read inputs but is **denied** all of the following:
- inserting results;
- updating seasons or entries;
- writing the audit log;
- reading profiles, settings (TV key), the audit log or `auth.users`;
- calling server write functions;
- creating tables.

No other role can call the close functions.

Inherent trust (by design, D21/D27): holding this password allows closing any *ended* season with results computed by the caller. Keep it in the hosting secret store only.

**VERIFIED (code + CI)**; staging-side checks in STAGING.md step 5: **NOT RUN**.

## 4. Setup execution (Phase 3)

| Step (STAGING.md) | Status | Evidence |
|---|---|---|
| 1 Supabase staging project, sign-up off, password ≥ 10 | REQUIRES OWNER | |
| 2 `.env.staging` filled | REQUIRES OWNER | |
| 3 `npm run staging:preflight` all PASS, refs compared | REQUIRES OWNER | paste the output (it contains no secrets) |
| 4 `staging:migrate` dry run lists the 8 migrations | REQUIRES OWNER | paste the list |
| 4 `staging:migrate -- --apply` | REQUIRES APPROVAL | |
| 5 close role login + 9 role checks | REQUIRES APPROVAL | paste the query results (true/false only) |
| 6 `staging:create-admin` | REQUIRES APPROVAL | |
| 7 Vercel project, branch, root dir, 5 variables | REQUIRES OWNER | |
| 7.5 staging deployment | REQUIRES APPROVAL | Vercel deployment id, commit |
| 8 `npm run staging:verify -- <url>` all PASS | NOT RUN | paste the output |

## 5. Acceptance checklist (Phase 4) — STAGING.md §2

| Step | Expected (short) | Actual | Status |
|---|---|---|---|
| 1–5 | Smoke 2020 closes with "0 final results frozen"; one audit record; repeat POST → 409 | | NOT RUN |
| 6–8 | Settings save; masked link, copy/open; 360 px layout | | NOT RUN |
| 9–12 | 2 coaches, 6 members, preseason D1 active, championship D2 scheduled with 6 participants | | NOT RUN |
| 13–18 | Coaches see only own clients; baselines logged; cross-coach and admin pages refused; TV preseason count 4 | | NOT RUN |
| 19–26 | Preseason closed (no results/reveal); entries with photo rule; coach undo; admin correction needs reason, audited; Delta inactive | | NOT RUN |
| 27 | **Alpha 310 · Bravo 117 · Foxtrot 33 · Echo 0**; Rookies **Charlie 37**; Delta absent | | NOT RUN |
| 28 | TV live = staff leaderboard | | NOT RUN |
| 29, 35 | TV "Results coming soon", no standings (D33) | | NOT RUN |
| 30–31 | Close: 6 frozen results; winners Alpha/Bravo/Foxtrot; Echo 4th; Charlie rookie; Delta not ranked, 12 | | NOT RUN |
| 32–34 | Closed: no Correct/Void; one close audit; repeat → 409; coach history | | NOT RUN |
| 36–37 | Reveal Foxtrot → Bravo → Alpha → podium; reload resumes | | NOT RUN |
| 38 | Rotation: old link "Display not authorized", new link works | | NOT RUN |
| 39 | Cron 200 daily; no header → 401 | | NOT RUN |
| 40–44 | Wrong password refused; coach 403 on close and key rotation; TV payload allow-list; rotation audit has no key; network loss recovers | | NOT RUN |

On any FAIL: record the actual result, then fix only a real defect, with a regression test, and re-run.
Expected scores and rules are not changed to make a step pass.

## 6. Security summary

| Area | Status |
|---|---|
| Preflight isolation (§3.2) | VERIFIED locally; staging run NOT RUN |
| Restricted role (§3.4) | VERIFIED in CI; staging checks NOT RUN |
| RLS / anon denied | VERIFIED in CI (DB suite); `staging:verify` NOT RUN |
| TV privacy allow-list | VERIFIED in CI (`e2e/tv.spec.ts`); step 42 NOT RUN |
| TV key rotation | VERIFIED in CI; steps 38 and 43 NOT RUN |
| Sign-up disabled | NOT RUN (`staging:verify`) |

## 7. Operational readiness

| Item | Status |
|---|---|
| Real phone (iOS/Android), LAUNCH_ACCEPTANCE §4 | REQUIRES OWNER, NOT RUN |
| Physical gym TV, TV_TEST_CHECKLIST | REQUIRES OWNER, NOT RUN |
| Coach onboarding (COACH_GUIDE + 45-min agenda) | REQUIRES OWNER, NOT RUN; material ready |
| Daily job (cron) | NOT RUN |

## 8. Open issues

| Issue | Severity | Impact | Owner / action | Blocks production? |
|---|---|---|---|---|
| Staging not yet created | — | no acceptance evidence yet | Owner: STAGING.md steps 1–2 | yes |
| PR #1 title/body still say "M0 foundation" | low | confusing review history | Owner decision; edit allowed only with approval | no |
| PR #1 merge vs. deploying production from the branch | decision | which branch production builds from | Owner decision | yes (before production) |

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

# Staging — setup, isolation and acceptance

Staging is a **separate copy of the whole system**: its own Supabase project (database, auth,
storage) and its own hosting project. It holds only invented people. It is where the season close,
the reveal, the TV and the coach workflows are accepted before launch.

Nothing in this guide touches production. Section 3 explains why that is guaranteed and how it is
checked. Never paste a secret into chat, a ticket or this file.

---

## 0. Owner checklist (the steps that need your accounts)

Work in this order. Each step names its section below. **Never paste a password, key or database
URL into a chat** — the command outputs listed here contain none of them and are safe to share.

| # | Where | Do | Copy → to | Never copy | Run | Success looks like | If it fails |
|---|---|---|---|---|---|---|---|
| A1 | Supabase → New project (step 1) | Project `gym-arena-staging`, new DB password (password manager) | project ref → notes; production ref → notes | anything from the production project except its ref | — | dashboard of the new project | — |
| A2 | Staging → Authentication (step 1.3) | Sign-ups **off**, min password length **10** | — | — | — | settings saved | — |
| A3 | Your computer, `gym-arena/` (step 2) | `cp .env.staging.example .env.staging` and fill it | staging URL, anon key, service key → `.env.staging`; Session-pooler URI + DB password → `STAGING_MIGRATION_DATABASE_URL`; production ref → `PRODUCTION_SUPABASE_REF` | production keys/URLs; `ADMIN_PASSWORD` (leave empty) | — | file saved, never committed (git ignores it) | — |
| A4 | New terminal (step 3) | Preflight | — | — | `npm ci && npm run staging:preflight` | every line PASS (WARN only for `sb_…` keys); both refs match the dashboards; last line `Staging preflight passed.` | fix the variable named on the FAIL line; re-run |
| A5 | Terminal (step 4) | Migration dry run | — | — | `npm run staging:migrate` | the 8 files listed in step 4, nothing else | stop; share the output |
| **Gate 1** | | **Share the A4 + A5 output and approve applying the migrations** | | | | | |
| A6 | Terminal (step 4) | Apply + check | — | — | `npm run staging:migrate -- --apply`, then the step 4 checks | 8 migrations applied; check counts as listed | stop; share the error text |
| **Gate 2** | | **Share the A6 check results and approve enabling the close role** | | | | | |
| A7 | Terminal (step 5) | Close role login + password, role checks | new close-role password → only into `SEASON_CLOSE_DATABASE_URL` (Transaction pooler URI) | the owner password into this variable | `npm run staging:psql`, then the SQL in step 5; then `npm run staging:preflight` | 9 checks as listed; preflight `PASS SEASON_CLOSE_DATABASE_URL: arena_season_closer on <ref>` | stop; share which check differs |
| **Gate 3** | | **Approve creating the staging admin** | | | | | |
| A8 | Terminal (step 6) | Admin account | — | — | `npm run staging:create-admin` (type the password when asked) | `Admin created: <email>` | message names the cause; nothing half-created |
| A9 | Vercel → Add New → Project (step 7) | New project `gym-arena-staging`; Branch Tracking `claude/ecstatic-goodall-3p1zte`; Root Directory `gym-arena`; 5 variables (Production, Sensitive) | 5 values from `.env.staging` → Vercel | `STAGING_MIGRATION_DATABASE_URL`, `PRODUCTION_*`, `ADMIN_*`, `NEXT_DIST_DIR`; anything from the production Vercel project | — | settings saved in **gym-arena-staging** | — |
| **Gate 4** | | **Approve the staging deployment** | | | | | |
| A10 | Vercel → Deployments (step 7.5) | Create Deployment from the branch | staging address → notes | — | — | status Ready, label Production of gym-arena-staging, latest branch commit | share the build log's error lines |
| A11 | Terminal (step 8) | Read-only verification | — | — | `npm run staging:verify -- https://<staging-address>` | every line PASS, `Staging verification passed.` | share the output |
| A12 | Phone, laptop, TV (§2) | Three-day checklist | results → `docs/STAGING_ACCEPTANCE_REPORT.md` §5 (or send them) | screenshots showing keys, passwords or TV link keys | — | as listed per step | record actual result; stop on FAIL |

## 1. Setup (one time, about 45 minutes)

### Step 1 — Create the staging Supabase project
1. Supabase dashboard → **New organization** `DFN GYM staging` (Free plan), then **New project**
   in it named `gym-arena-staging`. Use the same region you plan for production. Generate a strong
   database password and store it in your password manager.
   Keep staging in **its own free organization**. Supabase plans are per organization, and in a
   paid organization every extra project is billed for compute (about $10/month). The production
   project goes in a separate organization that is upgraded at launch.
2. Write down its **project ref**: the `xxxx` in `https://xxxx.supabase.co`. It is not a secret.
   Also write down the **production** project ref; the preflight (step 3) refuses to run without
   it, because every check compares against it. If no production project exists yet, create it
   now, empty (no app, no data, nothing connected), only so its ref exists. Copy both refs from
   the dashboards' address bars. **A wrong production ref blinds every check**, so the preflight
   prints it back for you to compare.
   The free plan pauses a project after about a week with little activity. Data is kept; if
   that happens between test days, restore it from the dashboard before continuing.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up" (accounts are
   created by the admin only; SECURITY_SPECIFICATION §1). Set **minimum password length ≥ 10**.
   Email confirmation and redirect URLs are not used by the app.

### Step 2 — Fill `.env.staging` on your computer
In `gym-arena/`, copy `.env.staging.example` to `.env.staging`. Git ignores this file. Only the
first two rows name production; every other value must come from the **staging** project.

| Variable | Required | Refers to | Purpose / where to find it |
|---|---|---|---|
| `PRODUCTION_SUPABASE_REF` | yes | **production** (ref only, not a secret) | What every check compares against. From the production dashboard URL. |
| `PRODUCTION_APP_ORIGIN` | optional | **production** (public address) | Lets the check refuse `APP_ORIGIN` = production address. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | staging | Staging → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | staging | Same page (anon / publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | staging | Same page (service_role / secret key) |
| `STAGING_MIGRATION_DATABASE_URL` | yes, on your computer only | staging | Staging → Connect → **Session pooler** URI (user `postgres.<ref>`, port 5432) + the database password from step 1. Used by steps 4–5 only. Never in hosting. |
| `SEASON_CLOSE_DATABASE_URL` | yes | staging | Filled in step 5. |
| `CRON_SECRET` | yes for staging | staging only | New random value, `openssl rand -hex 24`. Never the production one. |
| `APP_ORIGIN` | optional | staging | Leave empty (see §4). |
| `ADMIN_EMAIL`, `ADMIN_NAME` | step 6 only | staging | The staging admin's sign-in email and display name. |
| `ADMIN_PASSWORD` | leave **empty** | — | Step 6 asks for the password twice without showing it, so it is never written to disk. Not your production password. |

Keys: if the staging API Keys page offers **legacy** keys (`anon` and `service_role`, long
`eyJ…` values), use those — the preflight then proves from the key itself that it belongs to the
staging project. With the newer `sb_publishable_…` / `sb_secret_…` keys the preflight can only
WARN, and you confirm by eye that you copied them from the staging project's page.

Copy every URI exactly as the dashboard shows it. Do not add `?…` parameters: the check refuses any
except `sslmode`, because drivers let `?host=` / `?user=` override the visible address.

Use only letters and digits in database passwords (`openssl rand -hex 24`), so the URLs need no
escaping.

### Step 3 — Run the preflight (no network, prints no values)
Open a **new terminal** (no Supabase or `PG*` variables exported from earlier work), then:
```bash
cd gym-arena
npm ci
npm run staging:preflight
```
Compare the two refs it prints (`PRODUCTION_SUPABASE_REF: production project …` and
`NEXT_PUBLIC_SUPABASE_URL: staging project …`) with the two dashboards' address bars.
Every line must be `PASS` (a `WARN` for new-format `sb_…` keys only means "make sure you copied them
from the staging project"). It **fails** when:
- any URL, key or connection points at the production ref;
- any two values point at different projects;
- the close connection is not the restricted role;
- the production ref appears anywhere in the configuration;
- a variable exported in your shell overrides the value written in `.env.staging` (Node gives the
  shell priority, so the file you copy from would not be the one checked);
- a database URL carries query parameters (other than `sslmode`) or several hosts;
- this folder's Supabase CLI link targets production.

Run it again after every change to `.env.staging`.

### Step 4 — Apply the migrations to staging
```bash
npm run staging:migrate            # dry run: lists the 8 migrations it would apply
npm run staging:migrate -- --apply # applies them
```
The script re-runs the preflight and refuses on any FAIL. It then runs
`supabase db push --remote=<STAGING_MIGRATION_DATABASE_URL> --skip-vault`. That is an explicit
staging address, so a CLI link in the folder is never used. It never seeds: `supabase/seed.sql` also
refuses any database that is not a local development stack.

The migrations create:
- every table, rule, trigger and policy;
- the private storage buckets;
- a random TV key;
- the restricted role `arena_season_closer`, which cannot log in yet.

The dry run must list exactly these 8 files, in this order, and nothing else:
`20261114000001_schema`, `20261114000002_rules_and_triggers`, `20261114000003_rls_and_storage`,
`20261115000001_member_active_coach_guard`, `20261116000001_entry_evidence_once`,
`20261116000002_participants_select_set_based`, `20261116000003_set_based_read_policies`,
`20261116000004_leaderboard_baselines`. Anything else, or an error, means stop.

After `--apply`, check the result. These checks are read-only and contain no secrets. Run them in
`npm run staging:psql`, or in the staging SQL Editor after reading the project name:
```sql
select count(*) from supabase_migrations.schema_migrations;                                   -- 8
select count(*) from pg_tables where schemaname = 'public';                                   -- 11
select count(*) from pg_tables where schemaname = 'public' and not rowsecurity;               -- 0 (RLS on every table)
select count(*) from pg_policies where schemaname = 'public';                                 -- > 0
select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('begin_season_close','finish_season_close','server_log_entry','server_void_entry',
   'server_edit_entry','server_log_attendance');                                              -- 6
select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal; -- > 0
select id, public from storage.buckets where id in ('avatars','evidence') order by id;         -- 2 rows, public = f
select count(*) from public.app_settings;                                                     -- 1 (do not select its columns: it holds the TV key)
select count(*) from auth.users;                                                              -- 0 (no seed ran)
```

### Step 5 — Enable the restricted season-close role
Connect as the owner and set the password without it appearing in any query history:
```bash
npm run staging:psql
```
It runs the preflight first and refuses on any FAIL, then opens `psql` on the staging database
(needs `psql` installed, e.g. `brew install libpq`). In psql:
```sql
alter role arena_season_closer login;
\password arena_season_closer
-- type a new password (openssl rand -hex 24), twice. psql hashes it before sending.
```
Without `psql`: Supabase dashboard → **check the project name at the top is `gym-arena-staging`**
→ SQL Editor → a **new** snippet → `alter role arena_season_closer login password '<password>';`
→ Run → delete the snippet. This route sends the password as plain SQL text, which the database
may record in its logs; `npm run staging:psql` with `\password` does not, so prefer it. Running
this in the production project would give production's close role a login with your staging
password.

Still in the same session, check the role. These checks contain no secrets:
```sql
select rolcanlogin from pg_roles where rolname = 'arena_season_closer';                                   -- true
select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolinherit
  from pg_roles where rolname = 'arena_season_closer';                                                     -- all false
select count(*) from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = 'arena_season_closer'; -- 0
select has_function_privilege('arena_season_closer', 'public.begin_season_close(uuid, uuid)', 'execute');  -- true
select has_function_privilege('arena_season_closer', 'public.finish_season_close(uuid, jsonb)', 'execute'); -- true
select has_table_privilege('arena_season_closer', 'public.entries', 'select');                            -- true
select has_table_privilege('arena_season_closer', 'public.entries', 'update');                            -- false
select has_table_privilege('arena_season_closer', 'public.season_results', 'insert');                     -- false
select has_table_privilege('arena_season_closer', 'public.seasons', 'update');                            -- false
```
Leave psql with `\q`.
Then set in `.env.staging`, using the staging **Transaction pooler** host from the Connect dialog:
```
SEASON_CLOSE_DATABASE_URL=postgresql://arena_season_closer.<staging-ref>:<password>@<pooler-host>:6543/postgres
```
The pooler is needed because the hosting platform cannot reach Supabase's IPv6-only direct address.
The app opens one connection with prepared statements off, so transaction mode works. Run
`npm run staging:preflight` again; it must show `PASS SEASON_CLOSE_DATABASE_URL: arena_season_closer on <staging-ref>`.

Optional, before risky steps: `npm run staging:backup` writes a read-only `pg_dump` to
`backups/` (git-ignored; needs `pg_dump`, e.g. `brew install libpq`).

### Step 6 — Create the staging admin
```bash
npm run staging:create-admin
```
This runs the preflight first, asks for the admin password twice (nothing is shown or printed),
then creates the one admin account and prints only `Admin created: <email>`. It refuses if an
admin already exists or if it cannot read the existing accounts (wrong URL or key). Store the
password in your password manager.

### Step 7 — Create the staging hosting project (Vercel)
PR #1 does **not** need to be merged: a Vercel project can track any branch as its production
branch. The default branch (`arabic-content-system`) has no `gym-arena/` folder, so the root
directory is set after the import, not during it.

1. Vercel → **Add New → Project** → import `Hazemmo1234/Hazemmo1234` as a **new** project named
   `gym-arena-staging`. **Never** open or change an existing (production) project for any of this.
   Vercel immediately builds the default branch; that first deployment fails or shows the content
   files (the repository is public, so nothing new is exposed). Delete it later.
2. In **gym-arena-staging** → Settings → **Environments → Production → Branch Tracking**
   (older dashboards: Settings → Git → Production Branch): `claude/ecstatic-goodall-3p1zte`.
3. Settings → **Build and Deployment → Root Directory**: `gym-arena`; Framework Preset: Next.js.
4. Settings → **Environment Variables**, environment **Production** only, each marked **Sensitive**.
   The app reads exactly six variables (§3.1); staging sets five of them:

   | Variable | Staging value | Required |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from `.env.staging` | yes; without it every request fails |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.staging` | yes |
   | `SUPABASE_SERVICE_ROLE_KEY` | from `.env.staging` | yes; leaderboards, TV and writes fail without it |
   | `SEASON_CLOSE_DATABASE_URL` | from `.env.staging` | yes; close answers 503 without it |
   | `CRON_SECRET` | from `.env.staging` | yes for staging (checklist step 39); the job is refused without it |
   | `APP_ORIGIN` | **leave unset** | optional (§4) — the sixth variable |

   **Never** add `STAGING_MIGRATION_DATABASE_URL`, `PRODUCTION_SUPABASE_REF`, `PRODUCTION_APP_ORIGIN`
   or `ADMIN_*` to hosting. Do not set `NEXT_DIST_DIR` (a test-only build-folder switch read by
   `next.config.ts`; Vercel expects the default) or `NODE_ENV` (the platform sets it).
   `APP_TIMEZONE` is not read by the code (Cairo is fixed in `src/lib/time.ts`); leave it out. Copy values from the editor showing `.env.staging` after the preflight
   passed, never from the production project.
5. Deployments → **Create Deployment** → branch `claude/ecstatic-goodall-3p1zte` (the `NEXT_PUBLIC_*`
   values are built into the bundle, so build only after step 4; after any later variable change,
   **Redeploy**). If the dashboard offers no Create Deployment, ask for the next commit to be pushed
   to the branch. The deployment must show the branch name, the **latest commit of that branch on GitHub**, and
   the label **Production** of gym-arena-staging.
6. Open the staging address: the sign-in page appears. Delete the failed first deployment.

### Step 8 — Verify the deployment (read-only)
```bash
npm run staging:verify -- https://<staging-address>
```
It runs the preflight, then only GET requests, and prints status codes, never values. It checks:
- `/login` answers 200 and the deployed Content-Security-Policy names **only the staging project**.
  `next.config.ts` builds it from `NEXT_PUBLIC_SUPABASE_URL` at build time, so this proves which
  project the live bundle talks to. It fails on the production ref, another project, or none
  (variables were missing at build time → Redeploy).
- `/api/tv/state` without a key and with a wrong key → 401; `/api/cron/snapshot` without the
  secret → 401; `/api/me` without a session → 401.
- Supabase reports public sign-up **disabled**.
- The anonymous key cannot read `members`, `profiles`, `entries`, `attendance`, `season_results`,
  `app_settings` or `audit_log`.

Every line must be PASS before the checklist starts. Then sign in once as the staging admin:
the admin dashboard opens.

---

## 2. Staging acceptance checklist

Use three consecutive Cairo days: **D1** (today), **D2** (tomorrow) and **D3**. Close and reveal
need a season whose end date has passed, and scoring needs baselines from an earlier season. All
people are invented, and every photo can be any picture taken with the phone.

Record the date, the person and ✅ / ❌ for every line. On ❌, stop and send the step number and what
the screen showed. Do not send screenshots that show secrets.

### D1 · A. Smoke test of the close pipeline (do this first: it proves step 5)
1. Sign in as the staging admin on a phone. Seasons → **New season**: name `Smoke 2020`,
   type Championship, 2020-01-01 → 2020-01-31. It shows as **Waiting to be closed**.
2. **Close** → the confirmation shows 0 participants → tick → Close.
   Expected toast: "Championship closed — 0 final results frozen".
   "Season close is unavailable" means `SEASON_CLOSE_DATABASE_URL` or the role is wrong (step 5).
3. The row shows **Read-only**, **Results**. Results page: "no winners", with no rows.
4. Audit log → filter "Championship closed": exactly **one** record, by the admin.
5. Duplicate refused: in the browser console on the staging site, run
   `fetch('/api/seasons/<id>/close',{method:'POST'}).then(r=>r.status)` with `<id>` from the
   address bar of the season's Results page. Expected `409`. The audit log still has one record.

### D1 · B. Settings
6. Settings → change the gym name to `DFN GYM STAGING` → Save → toast. TV language → English → Save.
7. TV link is masked; **Show** reveals it, **Copy link** copies it, **Open TV** opens `/tv?key=…`.
   The link starts with the staging site address.
8. On a 360-px-wide phone: the page has no sideways scroll, and all three buttons sit fully above
   the bottom tab bar and are tappable.

### D1 · C. Staff and members
9. Coaches → **New coach** twice: `Coach One`, `Coach Two` (temporary passwords ≥ 10 characters).
10. Members → **New member**, six times, with fake names and fake `010…` numbers:

    | Member | Coach | Photo consent |
    |---|---|---|
    | Alpha | Coach One | yes, with a photo |
    | Bravo | Coach One | no |
    | Charlie | Coach One | no |
    | Delta | Coach Two | no |
    | Echo | Coach Two | no |
    | Foxtrot | Coach Two | no |

11. Seasons → **New season** `Staging preseason`, type **Preseason**, D1 → D1. Status: active.
12. Seasons → **New season** `Staging championship`, type Championship, D2 → D2. Status: scheduled,
    6 participants.

### D1 · D. Coach workflow — baselines (preseason)
13. Sign in as **Coach One** on a phone. Today lists **only** Alpha, Bravo and Charlie.
14. Alpha: Deadlift **100 kg × 5**, Pull-ups **5**, Push-ups **20**. Bravo: Bench **60 kg × 5**.
    Charlie: nothing (he stays a rookie). No photo is asked for in a preseason.
15. Sign in as **Coach Two**. Today lists only Delta, Echo and Foxtrot. Echo: Bench **50 kg × 5**.
    Foxtrot: Squat **80 kg × 5**. Delta: nothing.
16. Coach Two cannot open Alpha: going to Alpha's member URL is refused.
17. Admin pages are refused for a coach: `/admin/settings` redirects away.
18. TV (`Open TV` link, on a laptop or the TV): **Preseason** screen with a baselines-logged count
    of 4 members.

### D2 · E. Preseason close and live championship
19. Admin → Seasons → `Staging preseason` → **Close** → toast. No Results or Start reveal button
    is shown (a preseason has no winners).
20. Coach One logs, with a photo whenever the app asks:
    - Alpha: Deadlift **105 × 5**, Pull-ups **8**, Push-ups **30**, Treadmill **5 km**, attendance.
    - Bravo: Bench **70 × 5**, attendance.
    - Charlie: Treadmill **8 km**, attendance.
21. A photo is required when a result raises points, e.g. Alpha's deadlift. It is not required for
    attendance.
22. Coach Two logs:
    - Foxtrot: Squat **82 × 5**, attendance.
    - Delta: Treadmill **3 km**.
    - Echo: Bench **52 × 5**.
23. Coach void: Coach Two logs Echo Push-ups **15**, then **undoes** it straight away. It
    disappears from Today.
24. Coach One cannot void Coach Two's entries; they are not visible to him.
25. Admin correction: Admin → **Entries** → Echo's Bench 52 × 5 → **Correct** to 50 × 5. Without a
    reason Save is refused; with the reason `typo` it saves. Audit log shows the correction with
    the reason.
26. Admin → Members → Delta → set **inactive**.
27. Leaderboard (admin and coaches) shows the main board **Alpha 310 · Bravo 117 · Foxtrot 33 · Echo 0**,
    Rookies **Charlie 37**, and no Delta. These are SCORING §3 values with 12 planned sessions.
28. TV: **Live**, same order and points as the staff leaderboard, gym name `DFN GYM STAGING`,
    English. "New best" items appear in the ticker.

### D3 · F. Close, frozen results, reveal
29. Before closing, the TV shows **Results coming soon** and **no standings** (agreed product
    behavior: standings stay hidden until the reveal).
30. Admin → Seasons → `Staging championship` → **Close**. The confirmation shows 6 participants
    and the provisional top 3: Alpha, Bravo, Foxtrot. Tick → Close → "6 final results frozen".
31. Results page:
    - Winners Alpha (1), Bravo (2), Foxtrot (3).
    - Main board adds Echo (4).
    - Rookies: Charlie.
    - **Not ranked**: Delta, 12 points, "Inactive at close".
32. Frozen: Admin → Entries → choose `Staging championship`. A "closed" note is shown and no entry
    has Correct or Void. Results still show the same numbers after a page reload.
33. Audit log: exactly one "Championship closed" record for this season. Repeating the step 5
    `fetch` with this season's id → `409`.
34. Coach One → **History** → the championship shows his clients' final places. Coaches see no
    admin buttons.
35. TV, before the reveal: still **Results coming soon**, with no standings.
36. Admin → **Start reveal**. The TV runs intro → third place Foxtrot → second place Bravo →
    "The champion is…" → Alpha → Final podium.
37. Reload the TV page during the reveal: it resumes at the same step, not from the start.
38. Settings → **Generate new key** → confirm. Within about 10 seconds, the TV on the old link shows
    "Display not authorized". The new link works.

### D2 or D3 · G. Daily job
39. Vercel (staging project) → Logs: `GET /api/cron/snapshot` returned `200` once per day.
    `curl -i https://<staging-site>/api/cron/snapshot` (no header) → `401`.

### H · Security spot checks (do each on the day shown)
These add checks; they change nothing above.
40. **D1**, signed out: sign in with a wrong password → refused, no dashboard.
41. **D2**, signed in as Coach One, in the browser console of the staging site:
    `fetch('/api/seasons/<championship-id>/close',{method:'POST'}).then(r=>r.status)` → `403`;
    `fetch('/api/settings/tv-key',{method:'POST'}).then(r=>r.status)` → `403`. The TV link still works.
42. **D2**, while live: open `/api/tv/state?key=<current key>` in a browser. The board rows have only
    `rank, name, initials, photo_url, total, categories, gap_to_next, movement, pr_at, ref`.
    Search the page for the last 6 digits of Alpha's phone number, and for `+20`, `member_`,
    `coach`, `evidence` → no matches (the same allow-list is enforced in CI, `e2e/tv.spec.ts`).
43. **D3**, after step 38: Audit log → "TV key regenerated" → the record shows no key, old or new.
44. **D3** (optional here; required on the real TV): switch the TV's Wi-Fi off for 60 s →
    "Reconnecting" with the last screen kept; on → it recovers by itself.

### After acceptance
Keep the staging project for coach practice and future checks, or delete it. Deleting it cannot
affect production. Never copy staging data into production.

---

## 3. Why staging cannot affect production

1. **The app's only route to data is six variables** (`src/**` reads no other `process.env`;
   `next.config.ts` additionally reads `NODE_ENV`, set by the platform, and `NEXT_DIST_DIR`, a
   test-only output folder that is never set in hosting). Every `process.env` read in the app is one of
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SEASON_CLOSE_DATABASE_URL`, `CRON_SECRET` or `APP_ORIGIN`. No host or project is written in the
   code. The staging deployment can reach only the project those variables name.
2. **Separate projects share nothing.** A Supabase project has its own database, auth users,
   storage and keys. A staging key is rejected by the production project, and the reverse.
3. **Separate hosting project.** Staging variables live only in the `gym-arena-staging` Vercel
   project. Its cron job calls only its own deployment.
4. **The preflight proves the configuration** before every operator step. It runs before
   `staging:migrate`, `staging:psql` and `staging:create-admin`, checks the file's own values (a
   shell export cannot slip in), and refuses any value that names the production ref, mixes
   projects or hides a host in the URL (`scripts/staging-check.ts`, `scripts/staging-env.ts`;
   unit-tested in `tests/unit/staging-check.test.ts`). The migrate and psql commands also drop any
   inherited `PG*` variable (e.g. `PGHOSTADDR`) before connecting.
5. **Migrations go to an explicit staging URL**, checked by the preflight, never through a CLI link.
   They are add-only, so the same files will later build production identically.
6. **The seed cannot run on any cloud database.** Its first statement aborts unless the database is
   a local development stack with no accounts.
7. **Distinct secrets per environment.** The TV key is generated randomly per database. Use a
   different `CRON_SECRET`, close-role password and admin password for production.

### Manual steps where a mistake could reach production — read before each
| Step | Mistake | Consequence | Guard |
|---|---|---|---|
| 1 | Wrong `PRODUCTION_SUPABASE_REF` (typo, or the staging ref) | Every check compares against the wrong project | The preflight prints it; compare with the production dashboard URL |
| 5 (SQL Editor route) | Running the `alter role` in the **production** project | Production's close role gets a login with your staging password | Use `npm run staging:psql`; on the SQL Editor route, read the project name first |
| 7 | Changing the **production** Vercel project (variables, branch, root directory) | Production would run the feature branch or point at the staging database | Work only in `gym-arena-staging`; read the project name at the top of every settings page |
| 7.4 | Pasting a production key/URL into staging hosting | A production secret is copied into another project; staging traffic could hit production | Copy only from `.env.staging` after a passing preflight; new `sb_…` keys cannot be checked automatically (preflight WARN) — compare their source page |
| any | Running `supabase link`, `supabase db push` or `psql` by hand | Bypasses every check | Use only the `npm run staging:*` commands |
| any | Reusing a production password or secret | One leak opens both | Generate new ones for staging |
| after | Copying staging data into production | Invented people in the live championship | Never; production starts empty |

Production uses the same commands as `prod:*` with its own file `.env.production-ops`. There,
every value must name the declared production project and never the staging one, and each change
asks you to type the production ref (`docs/PRODUCTION_RUNBOOK.md`).

## 4. `APP_ORIGIN` — what the code actually does
`src/lib/origin.ts`: when `APP_ORIGIN` is set (trailing `/` removed), the TV link in Settings uses
it. Otherwise the link uses the address the request came in on (`x-forwarded-host`/`host` and
`x-forwarded-proto`). It is used for nothing else: no security checks, redirects or emails depend
on it.

- **Staging:** leave it unset; the link uses the staging address automatically.
- **Production:** optional. Set it to the final public address (e.g. `https://arena.dfngym.com`)
  if the admin may open Settings from another address, such as a `*.vercel.app` URL. Otherwise the
  copied TV link would carry that other address.

Missing value → the request's own host is used; nothing breaks.

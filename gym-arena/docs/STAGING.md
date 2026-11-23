# Staging — setup, isolation and acceptance

Staging is a **separate copy of the whole system**: its own Supabase project (database, auth,
storage) and its own hosting project. It holds only invented people. It is where the season close,
the reveal, the TV and the coach workflows are accepted before launch.

Nothing in this guide touches production. Section 3 explains why that is guaranteed and how it is
checked. Never paste a secret into chat, a ticket or this file.

---

## 1. Setup (one time, about 45 minutes)

### Step 1 — Create the staging Supabase project
1. Supabase dashboard → **New project**. Name it `gym-arena-staging`. Pick the same region you plan
   for production. Generate a strong database password and store it in your password manager.
2. Write down its **project ref**: the `xxxx` in `https://xxxx.supabase.co`. It is not a secret.
   Also write down the **production** project ref (or create the production project later and
   come back to this). The preflight check (step 3) needs both.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up" (accounts are
   created by the admin only; SECURITY_SPECIFICATION §1). Set **minimum password length ≥ 10**.
   Email confirmation and redirect URLs are not used by the app.

### Step 2 — Fill `.env.staging` on your computer
In `gym-arena/`, copy `.env.staging.example` to `.env.staging`. Git ignores this file. Fill in:

| Variable | Where to find it |
|---|---|
| `PRODUCTION_SUPABASE_REF` | The production project ref. Not a secret; it is used only to prove separation. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **Staging** project → Project Settings → API |
| `STAGING_MIGRATION_DATABASE_URL` | **Staging** project → Connect → **Session pooler** URI (user `postgres.<ref>`, port 5432), with the database password from step 1. It is used only on your computer, for step 4. |
| `CRON_SECRET` | New random value, e.g. `openssl rand -hex 24`. Different from production. |
| `APP_ORIGIN` | Leave empty (see §4). |
| `SEASON_CLOSE_DATABASE_URL` | Filled in step 5. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | The staging admin you create in step 6. Use a different password from production. |

Use only letters and digits in database passwords (`openssl rand -hex 24`), so the URLs need no
escaping.

### Step 3 — Run the preflight (no network, prints no values)
```bash
cd gym-arena
npm ci
npm run staging:preflight
```
Every line must be `PASS` (a `WARN` for new-format `sb_…` keys only means "make sure you copied them
from the staging project"). It **fails** when:
- any URL, key or connection points at the production ref;
- any two values point at different projects;
- the close connection is not the restricted role;
- the production ref appears anywhere in the configuration;
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

### Step 5 — Enable the restricted season-close role
Connect as the owner and set the password without it appearing in any query history:
```bash
psql "$(grep ^STAGING_MIGRATION_DATABASE_URL= .env.staging | cut -d= -f2-)"
```
```sql
alter role arena_season_closer login;
\password arena_season_closer
-- type a new password (openssl rand -hex 24), twice. psql hashes it before sending.
```
Without `psql`: run `alter role arena_season_closer login password '<password>';` in a **new** SQL
Editor snippet, then delete that snippet.

Check the role. These checks contain no secrets:
```sql
select rolcanlogin from pg_roles where rolname = 'arena_season_closer';                                   -- true
select has_function_privilege('arena_season_closer', 'public.begin_season_close(uuid, uuid)', 'execute');  -- true
select has_function_privilege('arena_season_closer', 'public.finish_season_close(uuid, jsonb)', 'execute'); -- true
select has_table_privilege('arena_season_closer', 'public.entries', 'select');                            -- true
select has_table_privilege('arena_season_closer', 'public.entries', 'update');                            -- false
select has_table_privilege('arena_season_closer', 'public.season_results', 'insert');                     -- false
select has_table_privilege('arena_season_closer', 'public.seasons', 'update');                            -- false
```
Then set in `.env.staging`, using the staging **Transaction pooler** host from the Connect dialog:
```
SEASON_CLOSE_DATABASE_URL=postgresql://arena_season_closer.<staging-ref>:<password>@<pooler-host>:6543/postgres
```
The pooler is needed because the hosting platform cannot reach Supabase's IPv6-only direct address.
The app opens one connection with prepared statements off, so transaction mode works. Run
`npm run staging:preflight` again; it must show `PASS SEASON_CLOSE_DATABASE_URL: arena_season_closer on <staging-ref>`.

### Step 6 — Create the staging admin
```bash
npm run staging:create-admin
```
This runs the preflight first, then creates the one admin account. It refuses if an admin already
exists. Afterwards, remove `ADMIN_PASSWORD` from `.env.staging`.

### Step 7 — Create the staging hosting project (Vercel)
1. Vercel → **Add New → Project** → import `Hazemmo1234/Hazemmo1234` as a **new** project named
   `gym-arena-staging`. Never add these settings to the production project.
2. **Root Directory**: `gym-arena`. Framework: Next.js (detected).
3. **Settings → Git → Production Branch**: `claude/ecstatic-goodall-3p1zte`. The staging project's
   own "production" deployment is the staging site, and Vercel Cron runs only on that deployment.
   PR #1 does not need to be merged for staging.
4. **Settings → Environment Variables**, environment **Production** of this staging project only,
   all marked **Sensitive**:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from `.env.staging` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.staging` |
   | `SUPABASE_SERVICE_ROLE_KEY` | from `.env.staging` |
   | `SEASON_CLOSE_DATABASE_URL` | from `.env.staging` |
   | `CRON_SECRET` | from `.env.staging` |
   | `APP_ORIGIN` | leave unset (see §4) |

   **Never** add `STAGING_MIGRATION_DATABASE_URL`, `PRODUCTION_SUPABASE_REF` or `ADMIN_*` to hosting.
5. Deploy, then open **Deployments**: the deployed commit must be `0480c0c` or later on that branch.
6. Copy the values into Vercel by selecting them in your editor, not by printing them in a terminal.

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
   Expected: a toast saying it was closed with 0 results.
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
32. Frozen: reactivate Delta, then try to log an entry or correct one dated D2. Both are refused,
    and Results still shows the same numbers.
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

### After acceptance
Keep the staging project for coach practice and future checks, or delete it. Deleting it cannot
affect production. Never copy staging data into production.

---

## 3. Why staging cannot affect production

1. **The app's only route to data is six variables.** Every `process.env` read in the app is one of
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SEASON_CLOSE_DATABASE_URL`, `CRON_SECRET` or `APP_ORIGIN`. No host or project is written in the
   code. The staging deployment can reach only the project those variables name.
2. **Separate projects share nothing.** A Supabase project has its own database, auth users,
   storage and keys. A staging key is rejected by the production project, and the reverse.
3. **Separate hosting project.** Staging variables live only in the `gym-arena-staging` Vercel
   project. Its cron job calls only its own deployment.
4. **The preflight proves the configuration** before every operator step. It runs before migrate
   and create-admin, and refuses any value that names the production ref or mixes projects
   (`scripts/staging-check.ts`, unit-tested in `tests/unit/staging-check.test.ts`).
5. **Migrations go to an explicit staging URL**, checked by the preflight, never through a CLI link.
   They are add-only, so the same files will later build production identically.
6. **The seed cannot run on any cloud database.** Its first statement aborts unless the database is
   a local development stack with no accounts.
7. **Distinct secrets per environment.** The TV key is generated randomly per database. Use a
   different `CRON_SECRET`, close-role password and admin password for production.

Remaining human risk: pasting a production value into the staging Vercel project. The Vercel
project is configured by hand, not by the preflight. Copy the values only from `.env.staging`
after it passes the preflight. If unsure, compare the project ref in
`NEXT_PUBLIC_SUPABASE_URL` in Vercel with the staging ref.

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

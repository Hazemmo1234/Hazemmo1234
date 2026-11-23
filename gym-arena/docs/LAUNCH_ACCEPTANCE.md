# Launch acceptance — operational checklist

Release under acceptance: branch `claude/ecstatic-goodall-3p1zte` (CI green on every job — see the
final handoff). Staging setup and the full staging checklist: `docs/STAGING.md`. Everything below happens **after** deployment, by the owner/admin. Nothing here has
been executed yet; tick and date each item as it is done. Never paste a secret value into chat,
tickets or this file.

## 1. Deployment settings — validate without exposing values

| Variable | Where | Required | Purpose | Validate (value never shown) | If missing |
|---|---|---|---|---|---|
| `SEASON_CLOSE_DATABASE_URL` | Hosting provider secret store, server env only (never `NEXT_PUBLIC_`) | Yes, to close seasons | Direct Postgres connection as the restricted role `arena_season_closer` for the close transaction (D21, D27) | §2 below (a test season closes); plus the role checks in §1a | Close button answers "not set up" (HTTP 503); the season stays open, nothing is written |
| `CRON_SECRET` | Hosting secret store; the scheduler sends it (Vercel Cron does automatically) | Recommended | Authorizes `GET /api/cron/snapshot` (daily rank snapshot, 00:05/01:05 Cairo) | Hosting cron log shows `200 {"ok":true,…}`; a request **without** the header returns 401 | Job refused (401). The first TV request of each day still writes the same snapshot, so arrows still work |
| `APP_ORIGIN` | Server env | Optional (recommended in production when the site has a custom domain) | Only the address at the start of the TV link shown in Settings (`src/lib/origin.ts`); nothing else uses it | Admin → Settings → TV link starts with the expected `https://…` address | The request's own host is used — opening Settings from a `*.vercel.app` address would then copy a TV link with that address |

Also required (already part of the base setup): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server only). Verified in the build: no server secret appears in any
browser bundle.

### 1a. Restricted close role — checks in the Supabase SQL editor (no secrets involved)
```sql
select rolcanlogin from pg_roles where rolname = 'arena_season_closer';                 -- true after enabling
select has_function_privilege('arena_season_closer', 'public.begin_season_close(uuid, uuid)', 'execute');  -- true
select has_function_privilege('arena_season_closer', 'public.finish_season_close(uuid, jsonb)', 'execute'); -- true
select has_table_privilege('arena_season_closer', 'public.season_results', 'insert');  -- false (only via the function)
select has_table_privilege('arena_season_closer', 'public.entries', 'update');          -- false
```

## 2. Season-close acceptance (dedicated test season only)

**Precondition — do not skip.** A closed season and its frozen results can never be deleted (by design).
A test season also enrols every active member automatically. So run this either
- **(recommended)** on a **staging** Supabase project — follow `docs/STAGING.md`, which has the full
  setup and a three-day checklist with expected scores (the seed refuses every non-local database,
  so staging data is entered through the app), or
- on production **before any real member is registered**, accepting one permanent season named
  "Acceptance test" in the admin season list.

Never close a live championship to test, and never run this on production once real members exist.

Steps (admin, in the app):
1. Seasons → New: name `Acceptance test`, type Championship, dates in a past month that overlaps no
   other season (e.g. a month in 2020). It shows as **Ended**.
2. Optional: Entries is empty for it; that is fine (results will be all zero).
3. Click **Close** → the confirmation shows counts and the provisional top 3 → tick the box → Close.
   Expected: toast "Championship closed — N final results frozen" (N = participants).
   If it says "not set up" → `SEASON_CLOSE_DATABASE_URL` is missing/wrong (§1).
4. The season row now shows **Closed / Read-only**, **Results** and **Start reveal**.
5. Results page: every participant appears once (ranked, rookies, or "Not ranked" for inactive members).
6. Audit log → filter "Championship closed": one record by you, with the frozen-results count.
7. Duplicate close is refused: there is no Close button any more; an API call to
   `POST /api/seasons/<id>/close` returns **409 SEASON_CLOSED**, and the audit log still has one record.
8. Reveal only after closure: an open/scheduled season shows no "Start reveal"; on the test season
   **Start reveal** works and the TV (if it has no active season) runs the reveal.
   For a preseason, Start reveal is never offered.

Record: date, environment (staging/production pre-launch), result of each step.

## 3. Physical TV acceptance
Use `docs/TV_TEST_CHECKLIST.md` on the actual gym TV (resolution/aspect ratio, full-screen/kiosk,
5 m readability in both languages, podium and 12 s paging, reveal 3rd → 2nd → champion → final podium,
refresh during the reveal, 60 s network loss and recovery, key rotation → old link shows
"Display not authorized"). Not yet performed.

## 4. Real-device mobile check (5 minutes)
On an actual phone (iOS Safari and Android Chrome if available), as admin:
- Settings: scroll to the bottom — Copy link / Open TV / Generate new key fully visible above the
  bottom tab bar and tappable; the keyboard opened from "Gym name" does not hide the Save button
  after scrolling.
- Entries: open Correct on an entry, type a reason — the dialog's buttons stay reachable.
The 360 px layout and the bottom-bar geometry are also checked automatically in CI (`e2e/m6-admin.spec.ts`).

## 5. Coach onboarding
Brief coaches with `docs/COACH_GUIDE.md` (agenda at the end of that file). Practice on staging, not on
real client data. Not yet performed.

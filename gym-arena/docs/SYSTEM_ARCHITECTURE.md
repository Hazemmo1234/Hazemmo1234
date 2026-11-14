# GYM ARENA — System Architecture

## Stack (confirmed)
Next.js (App Router) + TypeScript (strict) · Supabase (Postgres, Auth, Storage, RLS, pg_cron) · Tailwind CSS · Vercel · PWA (installable, no offline mode).

## Shape: modular monolith
```
src/
  app/
    (auth)/login
    (coach)/today, members/[id], members/new, leaderboard, history
    (admin)/dashboard, seasons, members, coaches, entries, audit, settings
    tv/                      ← public route, key-protected, no auth session
    api/                     ← route handlers (see API_SPECIFICATION.md)
  modules/
    scoring/                 ← PURE functions, zero I/O, 100% unit-tested
    seasons/                 ← season status, close, reveal
    members/
    entries/                 ← create/void/edit, photo rule, attendance side-effects
    leaderboard/             ← loads data → calls scoring → returns ranked rows
    tv/                      ← builds the public TV payload
    audit/
  lib/
    supabase/ (server client, browser client, service client — server only)
    time.ts                  ← Cairo "today", date helpers (single source)
    validation/              ← zod schemas shared by forms and API
    i18n/                    ← locale resolution, formatters (dates, numbers), direction helper
  messages/
    ar.json, en.json         ← all user-facing strings (identical keys in both)
supabase/
  migrations/                ← schema, RLS, triggers, seed categories
  seed.sql                   ← dev data
```
Rule: **modules never import from `app/`**; `scoring` imports nothing but types.

Repository: the application lives in `gym-arena/` inside a repository that also holds an unrelated project (D23). All paths in these documents are relative to `gym-arena/`. CI and Vercel use `gym-arena` as their root directory. One branch per milestone, PR into `main`.

## Key flows

### Logging an entry
1. Coach opens entry sheet → client calls `POST /api/entries/preview` → server loads member's B/M/season state → `scoring.previewEntry()` → returns e1RM, isNewBest, pointsDelta, photoRequired.
2. If photo required → client compresses + uploads to `evidence` (signed upload URL from server).
3. `POST /api/entries` → server identifies the caller from the verified Supabase Auth session (never from a client-supplied ID), re-validates (zod), checks permissions, active season, Cairo date, uniqueness, photo rule → inserts entry + auto attendance in **one transaction** (Postgres function `log_entry(...)`, callable only by the server) → returns new member score. The browser cannot write `entries` or `attendance` directly (D19, BR-X4).
4. TV picks up the change on its next poll.

### Leaderboard computation
- `leaderboard.getSeasonBoard(seasonId)` loads all non-voided entries for the season's participants + their pre-season maxima per category (one SQL query using `max(value) ... group by member_id, category` with `performed_on < starts_on`), attendance counts, planned sessions → `scoring.rankSeason()`.
- Data size: ≤150 members × ≤31 days × 7 → < 35k rows/month; computing on request is fine. Cache result in memory for 5 s per season (simple in-process cache keyed by season + max(entry.created_at / voided_at)).
- Closed seasons read from `season_results` only.

### TV updates
- MVP: TV **polls `GET /api/tv/state?key=` every 10 seconds**. Simple, robust, no websocket auth problems.
- The payload includes a `version` hash; the TV animates only when it changes.
- Rank arrows: compare current rank to `daily_rank_snapshots` of today (start of day). Between polls the TV also animates position changes it observes.
- Upgrade path (later): Supabase Realtime broadcast channel `season:{id}` fired by the server after each write.

### Close & reveal
- `POST /api/seasons/:id/close` (admin, today > ends_on) — D21:
  1. Authenticate the Admin from the verified session.
  2. Open **one PostgreSQL transaction on one connection** (a direct server-side Postgres connection, not the REST API), using the restricted season-close role from the server-only secret `SEASON_CLOSE_DATABASE_URL` (D27, SECURITY_SPECIFICATION §7).
  3. Lock the season row (`FOR UPDATE`). Every entry and attendance mutation takes a shared lock on the same season row, so writes wait for the close and then fail with `SEASON_CLOSED`; a second close request waits and then fails the same way.
  4. Read the authoritative entries, attendance, participants and baselines inside the transaction.
  5. Compute results with `modules/scoring` (TypeScript — formulas are never duplicated in SQL, D14).
  6. Verify completeness: exactly one result per participant, none for non-participants.
  7. Insert `season_results`, set `closed_at` / `closed_by`, write the audit row; commit.
  8. Any failure rolls back the whole operation. `closed_at` cannot be set by any other path.
  - A client-supplied fingerprint may be added as an extra safeguard, never as a replacement for recomputation.
  - **Dependency:** championship close can only be completed once M1 scoring is implemented and tested. The locking and integrity guards do not depend on M1.
- **Preseason close** (BR-S10) uses the same endpoint and lock but skips scoring: it sets `closed_at` (freezing the baseline entries) and writes no `season_results`.
- `POST /api/seasons/:id/reveal` sets `reveal_started_at`; TV switches to reveal mode (sequence driven client-side from that timestamp so a TV refresh resumes correctly).

### Scheduled jobs
- 00:05 Cairo daily: write `daily_rank_snapshots` for the active season.
- No automatic close — the Admin closes (BR-S5).

## Internationalization (D15–D18)
- Library: `next-intl`, cookie-based — **no locale segment in URLs**, so all routes in these documents are unchanged.
- Locales: `ar` (default, `rtl`) and `en` (`ltr`). Message catalogs in `src/messages/{ar,en}.json` with identical keys; components never contain literal user-facing strings.
- Staff locale resolution on the server: `profiles.locale` → `locale` cookie → `ar`. The root layout sets `<html lang dir>` from it. The switcher updates the cookie and (when signed in) the profile, then refreshes server data.
- TV locale: `app_settings.tv_locale`, returned in the TV state; the TV route sets its own `lang`/`dir` and ignores staff cookies.
- Formatting through one helper in `lib/i18n`: `ar-EG` with Latin digits and `en`, always in `Africa/Cairo`.
- The API returns stable error **codes**; the UI translates codes to messages. Business logic, scoring and stored data are locale-independent.

## Time
All "today" logic uses `Africa/Cairo` via one helper (`lib/time.ts`) on the server. Never trust the client clock. Database stores `performed_on` as `date`.

## Security (technical minimum)
Consolidated model: SECURITY_SPECIFICATION.md.
- Supabase Auth email/password; staff accounts created by Admin (server action using service role → `auth.admin.createUser`).
- Middleware: unauthenticated → `/login`; role-based route groups; inactive profiles signed out. Deactivating a coach also blocks sign-in and revokes sessions at the Auth level; the inactive-profile check stays on every path (D28).
- RLS on every table (see DATABASE_SCHEMA).
- **Server-only writes for `entries` and `attendance` (D19):** clients have no insert/update grant. The server derives the acting user from the verified Supabase Auth session and passes it to server-only database functions that re-apply every role rule (own member, today-only for coaches, active season, same-day void). The service role is a transport, not an authority: it never skips business authorization, and an acting-user ID from the client is never trusted.
- Closing is possible only through the close operation; `season_id` on an entry is derived from its date and cannot be changed.
- Service-role key only in server code (`lib/supabase/service.ts` with `import 'server-only'`).
- TV key compared in constant time; TV route returns curated fields only.
- Signed URLs for all images; buckets private.

## Migrations (D22)
- Until the first cloud deployment, the three original migration files are edited in place; the disposable local database is then reset once and re-verified. Editing an applied migration does not change an existing database — the local reset is what applies it.
- From the first cloud deployment on, migrations are **add-only**; applied files are never edited.
- `supabase/seed.sql` is local-only and must refuse to run outside a local database.

## Not in MVP
Offline queue, push notifications, member app, multi-branch, realtime websockets, analytics warehouse.

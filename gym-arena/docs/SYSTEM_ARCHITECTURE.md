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
supabase/
  migrations/                ← schema, RLS, triggers, seed categories
  seed.sql                   ← dev data
```
Rule: **modules never import from `app/`**; `scoring` imports nothing but types.

## Key flows

### Logging an entry
1. Coach opens entry sheet → client calls `POST /api/entries/preview` → server loads member's B/M/season state → `scoring.previewEntry()` → returns e1RM, isNewBest, pointsDelta, photoRequired.
2. If photo required → client compresses + uploads to `evidence` (signed upload URL from server).
3. `POST /api/entries` → server re-validates (zod), checks permissions, active season, Cairo date, uniqueness, photo rule → inserts entry + auto attendance in **one transaction** (Postgres function `log_entry(...)`) → returns new member score.
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
- `POST /api/seasons/:id/close` (admin, today > ends_on): compute final board → insert `season_results` → set `closed_at` → audit. One transaction.
- `POST /api/seasons/:id/reveal` sets `reveal_started_at`; TV switches to reveal mode (sequence driven client-side from that timestamp so a TV refresh resumes correctly).

### Scheduled jobs
- 00:05 Cairo daily: write `daily_rank_snapshots` for the active season.
- No automatic close — the Admin closes (BR-S5).

## Time
All "today" logic uses `Africa/Cairo` via one helper (`lib/time.ts`) on the server. Never trust the client clock. Database stores `performed_on` as `date`.

## Security (technical minimum)
- Supabase Auth email/password; staff accounts created by Admin (server action using service role → `auth.admin.createUser`).
- Middleware: unauthenticated → `/login`; role-based route groups; inactive profiles signed out.
- RLS on every table (see DATABASE_SCHEMA).
- Service-role key only in server code (`lib/supabase/service.ts` with `import 'server-only'`).
- TV key compared in constant time; TV route returns curated fields only.
- Signed URLs for all images; buckets private.

## Not in MVP
Offline queue, push notifications, member app, multi-branch, realtime websockets, analytics warehouse.

# GYM ARENA — API Specification

Next.js route handlers (or server actions with identical contracts). JSON in/out. All inputs validated with zod. Errors: `{ error: { code, message } }` with HTTP status.

Common error codes: `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `VALIDATION` 422 · `NO_ACTIVE_SEASON` 409 · `ALREADY_LOGGED_TODAY` 409 · `PHOTO_REQUIRED` 422 · `SEASON_CLOSED` 409 · `VOID_WINDOW_PASSED` 403.

## Auth
Handled by Supabase Auth client. `GET /api/me` → `{ id, full_name, role, locale }`. `PATCH /api/me` `{ locale: "ar" | "en" }` → same shape (any signed-in staff; only `locale` is editable).

Localization: responses carry stable error **codes**; `message` is for developers and is not shown to users — the UI translates by code. No endpoint's behavior, validation or data depends on the caller's language.

Identity: every endpoint takes the acting user from the verified Supabase Auth session. No endpoint accepts an acting-user ID from the client (D19).

## Members
| Method & path | Role | Body / query | Returns |
|---|---|---|---|
| GET /api/members | admin, coach (own) | `?q=&coach_id=&status=` | list: id, member_code, full_name, photo_url, coach, status, today_logged: category[] |
| POST /api/members | admin, coach | `{ full_name, phone, photo_path?, photo_consent, coach_id? }` (coach_id forced to self for coaches) | member |
| GET /api/members/:id | admin, coach (own) | | member + current season card (see below) |
| PATCH /api/members/:id | admin, coach (own) | `{ full_name?, phone?, photo_path?, photo_consent? }` | member |
| POST /api/members/:id/reassign | admin | `{ coach_id }` | member (audit) |
| POST /api/members/:id/status | admin | `{ status }` | member (audit) |
| PATCH /api/members/:id/plan | admin, coach (own) | `{ planned_sessions }` (active season) | participant |
| POST /api/uploads/avatar | admin, coach | `{ member_id }` | signed upload URL + path |

### Member season card (used by coach client screen)
```json
{
  "season": { "id": "…", "name": "…", "status": "active", "days_left": 12 },
  "is_rookie": false,
  "total": 726.15, "rank": 4,
  "planned_sessions": 10, "attended": 9,
  "categories": [
    { "code": "deadlift", "baseline": 100, "month_best": 110.83, "points": 72.22, "max": 100,
      "logged_today": false, "has_baseline": true }
  ]
}
```

## Entries
| Method & path | Role | Body | Returns |
|---|---|---|---|
| POST /api/entries/preview | admin, coach (own) | `{ member_id, category, weight_kg?, reps?, km? }` | `{ value, is_new_best, points_before, points_after, points_delta, total_after, photo_required }` |
| POST /api/uploads/evidence | admin, coach (own) | `{ member_id }` | signed upload URL + path |
| POST /api/entries | admin, coach (own) | `{ member_id, category, weight_kg?, reps?, km?, photo_path?, performed_on? (admin only) }` | `{ entry, member_card }` |
| POST /api/entries/:id/void | admin (until close), coach (entries they submitted, same day) | `{ reason }` — required for admin (422 if empty), optional for coach | `{ ok, member_card }`. Coach voiding an entry submitted by someone else → 403 FORBIDDEN, even for their own member (D26) |
| PATCH /api/entries/:id | admin (until close) | `{ weight_kg?, reps?, km?, performed_on?, reason }` — `reason` required | entry (recomputes value; audit with reason) |
| GET /api/entries | admin | `?season_id=&member_id=&coach_id=&category=&date=&include_voided=` | paginated list |
| POST /api/attendance | admin, coach (own) | `{ member_id }` | `{ ok, member_card }` (409 if already today) |

Entries and attendance can be written **only** through these endpoints; the browser has no direct database write access to them (D19, BR-X4).

Server rules on `POST /api/entries` (all must pass):
1. Caller may act on member (RLS + explicit check).
2. Member `active`; a season is active today (Cairo).
3. Field shape matches category (zod discriminated union).
4. No non-voided entry for (member, category, today).
5. Photo rule (SCORING §6) — `PHOTO_REQUIRED` if missing.
6. Insert entry + auto attendance in one DB transaction (`log_entry` function).

## Seasons
| Method & path | Role | Body | Returns |
|---|---|---|---|
| GET /api/seasons | admin, coach | | list with derived status |
| POST /api/seasons | admin | `{ name, type, starts_on, ends_on }` | season (creates participants) |
| PATCH /api/seasons/:id | admin | `{ name?, ends_on? }` (not closed; starts_on only if scheduled) | season |
| POST /api/seasons/:id/close | admin | | `{ results }` (409 unless today > ends_on and not closed). Atomic, recomputed on the server inside one transaction under the season lock (see SYSTEM_ARCHITECTURE "Close & reveal"). For a preseason: freezes baselines and returns `{ results: [] }` — no `season_results`, no winners |
| POST /api/seasons/:id/reveal | admin | | season (championship only; 409 for a preseason) |
| GET /api/seasons/:id/results | admin, coach | | frozen results |

## Leaderboard
| Method & path | Role | Returns |
|---|---|---|
| GET /api/leaderboard?season_id= | admin, coach | `{ main: Row[], rookies: Row[] }`, Row = `{ rank, member_id, full_name, photo_url, total, improvement_points, categories:{…}, coach_name }` (no phone) |

## TV (public, key-protected)
`GET /api/tv/state?key=…` → 401 if key invalid.
```json
{
  "version": "hash",
  "locale": "ar | en",
  "gym_name": "…",
  "mode": "live | preseason | between | reveal",
  "season": { "name": "…", "ends_on": "2026-12-31", "days_left": 12 },
  "next_season_starts_on": "2027-01-01",
  "board": [ { "rank": 1, "name": "…", "photo_url": "…|null", "initials": "AM",
               "total": 812, "movement": 2, "gap_to_next": 0, "categories": { "deadlift": 100, … } } ],
  "rookies": [ { "rank": 1, "name": "…", "photo_url": null, "initials": "…", "total": 310 } ],
  "recent_bests": [ { "name": "…", "category": "deadlift", "text": "Deadlift +12.4%", "at": "…" } ],
  "preseason": { "baselines_logged": 87, "participants": 120 },
  "reveal": { "started_at": "…", "winners": [ { "place": 3, … }, { "place": 2, … }, { "place": 1, … } ] }
}
```
Totals are already rounded to integers. `photo_url` is a 1-hour signed URL, only if consent. `locale` is the Admin's TV language setting (D17); `gym_name`, season name and member names are returned as stored; `recent_bests[].text` is built from the category name and numbers only (e.g. "Deadlift +12.4%") so it reads the same in both languages.

## Admin misc
| Method & path | Role | Purpose |
|---|---|---|
| GET /api/admin/dashboard | admin | KPIs (see UX spec) |
| POST /api/coaches | admin | `{ full_name, email, password }` create coach |
| PATCH /api/coaches/:id | admin | `{ full_name?, is_active? }` (deactivate blocked if active members). Deactivation also blocks sign-in and revokes the coach's sessions at the Auth level; reactivation lifts the block (D28) |
| GET /api/audit | admin | paginated audit log |
| GET /api/settings | admin | `{ gym_name, tv_locale, tv_url }` |
| PATCH /api/settings | admin | `{ gym_name?, tv_locale? }` (audit) |
| POST /api/settings/tv-key | admin | regenerate TV key |
| POST /api/cron/snapshot | cron secret | write daily rank snapshot |

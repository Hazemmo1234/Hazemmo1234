# GYM ARENA — Database Schema (Supabase / PostgreSQL)

Principles: entries are an **append-only event log** (void, never delete); scores are **derived** from entries by the scoring module; final results are **frozen** at close. This replaces a mutable points-ledger: every point is traceable to the entries that produced it, and closed seasons are immutable.

## Enums
```sql
create type user_role       as enum ('admin','coach');
create type member_status   as enum ('active','inactive');
create type season_type     as enum ('preseason','championship');
create type category_code   as enum ('deadlift','bench','squat','pullups','pushups','treadmill');
create type attendance_src  as enum ('auto','manual');
```
(Consistency is derived from `attendance`; it is not an entry category.)

## Tables

### profiles — staff
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| full_name | text not null | |
| role | user_role not null | |
| is_active | boolean not null default true | inactive coaches cannot sign in (checked in middleware + RLS) |
| locale | text not null default 'ar' check (locale in ('ar','en')) | staff UI language (D16) |
| created_at | timestamptz default now() | |

### members
| Column | Type | Notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| member_code | text unique not null | `GA-` + lpad(nextval('member_code_seq'),6,'0'), set by trigger |
| full_name | text not null | |
| phone | text not null | E.164-normalized `+20…`; unique |
| photo_path | text null | storage path in `avatars` bucket |
| photo_consent | boolean not null default false | |
| coach_id | uuid not null FK → profiles.id | current coach |
| status | member_status not null default 'active' | |
| joined_on | date not null default (now() at time zone 'Africa/Cairo')::date | |
| created_by | uuid FK → profiles.id | |
| created_at / updated_at | timestamptz | |

### coach_assignments — history
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| member_id | uuid FK → members | |
| coach_id | uuid FK → profiles | |
| started_at | timestamptz not null | |
| ended_at | timestamptz null | null = current |
Constraint: one open row per member (partial unique index on member_id where ended_at is null).

### seasons
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text not null | e.g. "Arena — December 2026". One field, shown as entered in both languages (D18) |
| type | season_type not null | |
| starts_on / ends_on | date not null | check ends_on ≥ starts_on |
| closed_at | timestamptz null | set **only** by the close operation (never by a direct update or on insert) |
| closed_by | uuid FK → profiles | |
| reveal_started_at | timestamptz null | set by "Start reveal" |
| created_at | timestamptz | |
Constraint: no overlapping date ranges (`exclude using gist (daterange(starts_on, ends_on, '[]') with &&)`, needs `btree_gist`).
Derived status: `closed` if closed_at not null; `active` if today ∈ [starts_on, ends_on]; `scheduled` if today < starts_on; `ended` (awaiting close) if today > ends_on and not closed.

### season_participants
| Column | Type | Notes |
|---|---|---|
| season_id | uuid FK | PK (season_id, member_id) |
| member_id | uuid FK | |
| planned_sessions | int not null default 12 check (planned_sessions between 1 and 31) | |
| updated_by / updated_at | | |
Rows created when a season is created (all active members) and when a member is registered during an active season (lazy upsert on first access is acceptable).

### entries
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| member_id | uuid FK not null | |
| season_id | uuid FK not null | season active on performed_on; derived by the database, **immutable** after insert |
| category | category_code not null | |
| performed_on | date not null | Cairo date |
| weight_kg | numeric(6,2) null | lifts only |
| reps | int null | lifts (3–5), pullups, pushups |
| km | numeric(5,2) null | treadmill only |
| value | numeric(10,4) not null | lifts: e1RM; pullups/pushups: reps; treadmill: km |
| photo_path | text null | `evidence` bucket; must be under this entry's member folder |
| logged_by | uuid FK → profiles not null | |
| created_at | timestamptz default now() | |
| voided_at | timestamptz null | |
| voided_by | uuid FK → profiles null | |
| void_reason | text null | |
Constraints:
- check per category: lifts → weight_kg > 0 and reps in (3,4,5) and km is null; pullups → reps between 0 and 100; pushups → reps between 0 and 300; treadmill → km between 0.1 and 42.2.
- **partial unique index** `(member_id, category, performed_on) where voided_at is null`.
Indexes: `(season_id, member_id)`, `(member_id, category, performed_on)`, `(season_id, created_at desc)`.

### attendance
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| member_id | uuid FK | |
| season_id | uuid FK | |
| attended_on | date | |
| source | attendance_src | |
| logged_by | uuid FK | |
| created_at, voided_at, voided_by | | |
Partial unique `(member_id, attended_on) where voided_at is null`.

### season_results — frozen at close
Written only by the championship close operation. A preseason close writes no rows (D20).
| Column | Type |
|---|---|
| season_id, member_id | PK |
| is_rookie | boolean |
| deadlift, bench, squat, pullups, pushups, treadmill, consistency | numeric(8,4) |
| improvement_points, total | numeric(8,4) |
| rank | int (null for rookies) |
| rookie_rank | int (null for non-rookies) |
| baseline_json, month_best_json | jsonb (B and M per category, for audit) |
| frozen_at | timestamptz |

### daily_rank_snapshots — for rank-movement arrows
| Column | Type |
|---|---|
| season_id, member_id, snapshot_on | PK |
| rank | int |
| total | numeric(8,4) |
Written once per day at 00:05 Cairo by a scheduled job (Supabase `pg_cron` calling an edge function, or Vercel Cron → API route).

### audit_log
| Column | Type |
|---|---|
| id | bigint identity PK |
| actor_id | uuid FK → profiles |
| action | text (`entry.void`, `entry.edit`, `member.reassign`, `member.deactivate`, `season.close`, `season.extend`, `tv_key.regenerate`, …) |
| entity_type, entity_id | text, uuid |
| before, after | jsonb |
| reason | text null — mandatory for Admin corrections (`entry.void`, `entry.edit`) |
| created_at | timestamptz |

### app_settings — single row
| Column | Type |
|---|---|
| id | int PK check (id = 1) |
| tv_key | text not null (random 32+ chars) |
| gym_name | text (one field, shown as entered in both languages — D18) |
| tv_locale | text not null default 'ar' check (tv_locale in ('ar','en')) — TV language, independent of staff (D17) |

## Storage
| Bucket | Public | Path | Access |
|---|---|---|---|
| `avatars` | private | `members/{member_id}/{uuid}.webp` | admin all; coach own members; TV via server-generated signed URL (1 h) only if consent |
| `evidence` | private | `entries/{season_id}/{member_id}/{uuid}.webp` | admin all; coach own members |
Client compresses images before upload (max 1280 px, WebP/JPEG ~80%).

## RLS summary
Helper: `is_admin()` = exists profile with id = auth.uid(), role = 'admin', is_active.
Helper: `is_active_coach()` similarly.

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| profiles | admin all; self | admin | admin | none |
| members | admin all; coach where coach_id = auth.uid() | admin; coach with coach_id = auth.uid() | admin all; coach own (cannot change coach_id/status) | none |
| coach_assignments | admin; coach own members | via server function | via server function | none |
| seasons | all authenticated | admin | admin (not after closed_at) | none |
| season_participants | admin; coach own | admin; coach own | admin; coach own (planned_sessions only, season not closed) | none |
| entries | admin; coach own members | **none for clients — server only (D19)** | **none for clients — server only (D19)** | none |
| attendance | same as entries | same | same | none |
| season_results | all authenticated | server (service role) on close | none | none |
| audit_log | admin | server | none | none |
| daily_rank_snapshots | admin | server | none | none |
| app_settings | admin | none | admin | none |

**Entries and attendance writes (D19, BR-X4):** the `authenticated` role has no insert/update grant on these tables. The server calls server-only functions (`server_log_entry`, `server_void_entry`, `server_edit_entry`, `server_log_attendance`; executable by the service role only) with the acting user taken from the verified session. The rules are applied by table triggers for that acting user, so they hold on every path; a write with no acting staff user is rejected whatever the database role. Attendance rows are never edited directly — they are voided only as a consequence of voiding entries (BR-E10). those functions enforce the same rules that used to be client-facing policies — coach: own active members, `performed_on` = today (Cairo), active non-closed season, void only entries they submitted (`logged_by` = acting coach) on the same day — regardless of the member's current coach (D26); admin: any member, any date within the active season up to today, edit/void until close with a mandatory reason. Read policies are unchanged.

**Season lock:** the close operation locks the season row `FOR UPDATE` (`begin_season_close`); every entry/attendance write takes a shared lock on that row first (`lock_open_season`) (D21). Function execute rights are revoked from everyone by default and granted back per role.

**Integrity guards (from the M0 security audit):** `seasons.ends_on` cannot be moved before the latest non-voided entry; the last active admin cannot be deactivated; coaches cannot change `joined_on`, `created_by`, `created_at` on members; `members.photo_path` / `entries.photo_path` must sit under that member's folder; the evidence path's season segment must be a real season; staff can update only their own `profiles.locale` (nothing else on their profile).

**Season-close database role (D27):** a dedicated login role used only by the close operation — see SECURITY_SPECIFICATION §7 for its exact permissions.

**Migrations:** see SYSTEM_ARCHITECTURE "Migrations" (D22). `seed.sql` must abort unless it is running against a local database.

**Leaderboard for coaches:** coaches must see all members' names and points but not their phones. Implement leaderboard via a server route (service role, curated fields), not by widening `members` RLS.

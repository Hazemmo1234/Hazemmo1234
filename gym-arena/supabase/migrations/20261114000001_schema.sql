-- GYM ARENA — core schema (docs/DATABASE_SCHEMA.md)
-- Entries are an append-only event log (void, never delete); scores are derived
-- by src/modules/scoring; final results are frozen at close.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── Enums ─────────────────────────
create type public.user_role      as enum ('admin','coach');
create type public.member_status  as enum ('active','inactive');
create type public.season_type    as enum ('preseason','championship');
create type public.category_code  as enum ('deadlift','bench','squat','pullups','pushups','treadmill');
create type public.attendance_src as enum ('auto','manual');

-- ───────────────────────── Time helper ─────────────────────────
-- Single DB-side source of "today" (Africa/Cairo). Mirrors src/lib/time.ts.
create or replace function public.app_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Africa/Cairo')::date $$;

-- ───────────────────────── profiles (staff) ─────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id),
  full_name   text not null check (length(btrim(full_name)) > 0),
  role        public.user_role not null,
  is_active   boolean not null default true,
  locale      text not null default 'ar' check (locale in ('ar','en')),   -- D16
  created_at  timestamptz not null default now()
);

-- ───────────────────────── members ─────────────────────────
create sequence public.member_code_seq as bigint start 1 no cycle;  -- BR-P2: never reused

create table public.members (
  id             uuid primary key default gen_random_uuid(),
  member_code    text not null unique,
  full_name      text not null check (length(btrim(full_name)) > 0),
  -- BR-P3 / D12: Egyptian mobile, E.164-normalized (+20 1[0125] xxxxxxxx)
  phone          text not null unique check (phone ~ '^\+201[0125][0-9]{8}$'),
  -- avatars bucket; must sit under this member's own folder (SECURITY_SPECIFICATION §8)
  photo_path     text null check (photo_path is null or photo_path like 'members/' || id::text || '/%'),
  photo_consent  boolean not null default false,
  coach_id       uuid not null references public.profiles (id),
  status         public.member_status not null default 'active',
  joined_on      date not null default ((now() at time zone 'Africa/Cairo')::date),
  created_by     uuid null references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index members_coach_idx on public.members (coach_id);
create index members_status_idx on public.members (status);

-- ───────────────────────── coach_assignments (history) ─────────────────────────
create table public.coach_assignments (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id),
  coach_id    uuid not null references public.profiles (id),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz null,
  check (ended_at is null or ended_at >= started_at)
);
create unique index coach_assignments_one_open
  on public.coach_assignments (member_id) where ended_at is null;
create index coach_assignments_coach_idx on public.coach_assignments (coach_id);

-- ───────────────────────── seasons ─────────────────────────
create table public.seasons (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(btrim(name)) > 0),
  type               public.season_type not null,
  starts_on          date not null,
  ends_on            date not null,
  closed_at          timestamptz null,
  closed_by          uuid null references public.profiles (id),
  reveal_started_at  timestamptz null,
  created_at         timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (reveal_started_at is null or closed_at is not null),           -- BR-S8
  -- BR-S1: seasons never overlap
  constraint seasons_no_overlap
    exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);

-- ───────────────────────── season_participants ─────────────────────────
create table public.season_participants (
  season_id         uuid not null references public.seasons (id),
  member_id         uuid not null references public.members (id),
  planned_sessions  int not null default 12 check (planned_sessions between 1 and 31),  -- BR-P4
  updated_by        uuid null references public.profiles (id),
  updated_at        timestamptz not null default now(),
  primary key (season_id, member_id)
);
create index season_participants_member_idx on public.season_participants (member_id);

-- ───────────────────────── entries ─────────────────────────
create table public.entries (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members (id),
  season_id     uuid not null references public.seasons (id),
  category      public.category_code not null,
  performed_on  date not null,
  weight_kg     numeric(6,2) null,
  reps          int null,
  km            numeric(5,2) null,
  value         numeric(10,4) not null,
  photo_path    text null,
  logged_by     uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  voided_at     timestamptz null,
  voided_by     uuid null references public.profiles (id),
  void_reason   text null,
  -- BR-E4: input shape per category
  constraint entries_shape check (
    case category
      when 'deadlift' then weight_kg > 0 and weight_kg <= 500 and mod(weight_kg * 2, 1) = 0
                           and reps in (3,4,5) and km is null
      when 'bench'    then weight_kg > 0 and weight_kg <= 500 and mod(weight_kg * 2, 1) = 0
                           and reps in (3,4,5) and km is null
      when 'squat'    then weight_kg > 0 and weight_kg <= 500 and mod(weight_kg * 2, 1) = 0
                           and reps in (3,4,5) and km is null
      when 'pullups'  then reps between 0 and 100 and weight_kg is null and km is null
      when 'pushups'  then reps between 0 and 300 and weight_kg is null and km is null
      when 'treadmill' then km between 0.1 and 42.2 and mod(km * 10, 1) = 0
                           and weight_kg is null and reps is null
    end
  ),
  constraint entries_void_consistent check (
    (voided_at is null and voided_by is null) or (voided_at is not null)
  )
);
-- BR-E2: one non-voided entry per member, category, day
create unique index entries_one_per_day
  on public.entries (member_id, category, performed_on) where voided_at is null;
create index entries_season_member_idx on public.entries (season_id, member_id);
create index entries_member_cat_day_idx on public.entries (member_id, category, performed_on);
create index entries_season_created_idx on public.entries (season_id, created_at desc);

-- ───────────────────────── attendance ─────────────────────────
create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id),
  season_id    uuid not null references public.seasons (id),
  attended_on  date not null,
  source       public.attendance_src not null,
  logged_by    uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  voided_at    timestamptz null,
  voided_by    uuid null references public.profiles (id)
);
-- BR-E2: max one attendance per member per day
create unique index attendance_one_per_day
  on public.attendance (member_id, attended_on) where voided_at is null;
create index attendance_season_member_idx on public.attendance (season_id, member_id);

-- ───────────────────────── season_results (frozen at close) ─────────────────────────
create table public.season_results (
  season_id           uuid not null references public.seasons (id),
  member_id           uuid not null references public.members (id),
  is_rookie           boolean not null,
  deadlift            numeric(8,4) not null,
  bench               numeric(8,4) not null,
  squat               numeric(8,4) not null,
  pullups             numeric(8,4) not null,
  pushups             numeric(8,4) not null,
  treadmill           numeric(8,4) not null,
  consistency         numeric(8,4) not null,
  improvement_points  numeric(8,4) not null,
  total               numeric(8,4) not null check (total between 0 and 1000),
  rank                int null,
  rookie_rank         int null,
  baseline_json       jsonb not null default '{}'::jsonb,
  month_best_json     jsonb not null default '{}'::jsonb,
  frozen_at           timestamptz not null default now(),
  primary key (season_id, member_id),
  check ((is_rookie and rank is null) or (not is_rookie and rookie_rank is null))  -- BR-R2
);

-- ───────────────────────── daily_rank_snapshots ─────────────────────────
create table public.daily_rank_snapshots (
  season_id    uuid not null references public.seasons (id),
  member_id    uuid not null references public.members (id),
  snapshot_on  date not null,
  rank         int not null,
  total        numeric(8,4) not null,
  primary key (season_id, member_id, snapshot_on)
);

-- ───────────────────────── audit_log ─────────────────────────
create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid null references public.profiles (id),
  action       text not null,
  entity_type  text not null,
  entity_id    uuid null,
  before       jsonb null,
  after        jsonb null,
  reason       text null,          -- mandatory for Admin corrections (BR-E9, D26)
  created_at   timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_action_idx on public.audit_log (action);
create index audit_log_actor_idx on public.audit_log (actor_id);

-- ───────────────────────── app_settings (single row) ─────────────────────────
create table public.app_settings (
  id        int primary key default 1 check (id = 1),
  tv_key    text not null check (length(tv_key) >= 32),   -- D3
  gym_name  text null,             -- one field, shown as entered in both languages (D18)
  tv_locale text not null default 'ar' check (tv_locale in ('ar','en'))   -- D17
);
insert into public.app_settings (id, tv_key, gym_name)
values (1, encode(extensions.gen_random_bytes(24), 'hex'), 'DFN GYM');

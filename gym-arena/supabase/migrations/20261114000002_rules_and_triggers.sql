-- GYM ARENA — acting-user helpers, business-rule triggers, audit triggers,
-- server-only write functions and the season-close contract.
--
-- Security model (docs/SECURITY_SPECIFICATION.md):
--   * Every rule is keyed to the ACTING STAFF USER (current_actor()), never to the
--     database role. The service role is a transport, not an authority (D19).
--   * entries / attendance are written only through the server_* functions below.
--   * A season is closed only through begin_season_close / finish_season_close (D21).

-- ───────────────────────── Acting user ─────────────────────────
-- Migrations and the local seed run as the database owner; nothing else does.
create or replace function public.is_owner_session()
returns boolean language sql stable set search_path = '' as $$
  select session_user in ('postgres', 'supabase_admin')
$$;

-- The acting staff user: the signed-in user's verified JWT subject, or — for
-- server-only functions — the actor those functions were given by the server after
-- it verified the session. app.actor_id is transaction-local and is set only by
-- assert_server_actor() and begin_season_close().
create or replace function public.current_actor()
returns uuid language sql stable set search_path = '' as $$
  select coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = public.current_actor() and p.role = 'admin' and p.is_active
  )
$$;

create or replace function public.is_active_coach()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = public.current_actor() and p.role = 'coach' and p.is_active
  )
$$;

-- "Own member" = members.coach_id is the acting coach (USER_ROLES Enforcement)
create or replace function public.is_own_member(p_member_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_coach() and exists (
    select 1 from public.members m
    where m.id = p_member_id and m.coach_id = public.current_actor()
  )
$$;

-- Season covering a given Cairo date (BR-S3: derived from dates, not a toggle).
create or replace function public.season_on(p_day date)
returns public.seasons language sql stable set search_path = '' as $$
  select s.* from public.seasons s
  where p_day between s.starts_on and s.ends_on
  limit 1
$$;

-- Audit rows always have an actor (SECURITY_SPECIFICATION §9); only owner sessions
-- (migrations, local seed) may write one without.
create or replace function public.audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb,
  p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_actor() is null and not public.is_owner_session() then
    raise exception 'FORBIDDEN: change without an identified acting user' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after, reason)
  values (public.current_actor(), p_action, p_entity_type, p_entity_id, p_before, p_after,
          nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

-- Generic guard: direct writes need an acting, active staff user. Blocks the service
-- role (no actor) from being used as a way around authorization. Writes made by other
-- triggers (depth > 1) and owner sessions pass; RLS still decides which rows a user may touch.
create or replace function public.require_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_owner_session() or pg_trigger_depth() > 1
     or public.is_admin() or public.is_active_coach() then
    return new;
  end if;
  raise exception 'FORBIDDEN: no acting staff user' using errcode = 'P0001';
end $$;

create trigger a_require_staff before insert or update on public.members
  for each row execute function public.require_staff();
create trigger a_require_staff before insert or update on public.seasons
  for each row execute function public.require_staff();
create trigger a_require_staff before insert or update on public.season_participants
  for each row execute function public.require_staff();
create trigger a_require_staff before insert or update on public.app_settings
  for each row execute function public.require_staff();

-- ───────────────────────── No hard deletes (BR-E8, BR-S7) ─────────────────────────
create or replace function public.forbid_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'DELETE_FORBIDDEN: % rows are never hard-deleted', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger entries_no_delete        before delete on public.entries        for each row execute function public.forbid_delete();
create trigger attendance_no_delete     before delete on public.attendance     for each row execute function public.forbid_delete();
create trigger members_no_delete        before delete on public.members        for each row execute function public.forbid_delete();
create trigger seasons_no_delete        before delete on public.seasons        for each row execute function public.forbid_delete();
create trigger season_results_no_delete before delete on public.season_results for each row execute function public.forbid_delete();
create trigger audit_log_no_delete      before delete on public.audit_log      for each row execute function public.forbid_delete();
create trigger assignments_no_delete    before delete on public.coach_assignments for each row execute function public.forbid_delete();
create trigger profiles_no_delete       before delete on public.profiles       for each row execute function public.forbid_delete();

-- season_results and audit_log are immutable once written (BR-S7, BR-E11)
create or replace function public.forbid_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'IMMUTABLE: % rows cannot be updated', tg_table_name using errcode = 'P0001';
end $$;
create trigger season_results_immutable before update on public.season_results for each row execute function public.forbid_update();
create trigger audit_log_immutable      before update on public.audit_log      for each row execute function public.forbid_update();

-- ───────────────────────── members ─────────────────────────
create or replace function public.members_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- BR-P2: sequential GA-000001, never reused (ignores any payload value)
  new.member_code := 'GA-' || lpad(nextval('public.member_code_seq')::text, 6, '0');
  -- AC-5: a coach always registers members to themselves, regardless of payload
  if public.is_active_coach() then
    new.coach_id := public.current_actor();
    new.status := 'active';
  end if;
  if not public.is_owner_session() then
    new.created_by := public.current_actor();
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;
create trigger members_before_insert before insert on public.members
  for each row execute function public.members_before_insert();

create or replace function public.members_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.member_code is distinct from old.member_code
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'FORBIDDEN: member id, code and creation record are immutable' using errcode = 'P0001';
  end if;
  -- USER_ROLES: only the admin reassigns, changes status or corrects the join date
  if not public.is_admin() and not public.is_owner_session()
     and (new.coach_id is distinct from old.coach_id or new.status is distinct from old.status
          or new.joined_on is distinct from old.joined_on) then
    raise exception 'FORBIDDEN: only the admin can reassign, change status or join date' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger members_before_update before update on public.members
  for each row execute function public.members_before_update();

create or replace function public.members_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- BR-P6: assignment history starts at registration
    insert into public.coach_assignments (member_id, coach_id, started_at)
    values (new.id, new.coach_id, now());
  elsif new.coach_id is distinct from old.coach_id then
    -- BR-P6: close old assignment, open new one; past entries keep logged_by
    update public.coach_assignments set ended_at = now()
      where member_id = new.id and ended_at is null;
    insert into public.coach_assignments (member_id, coach_id, started_at)
    values (new.id, new.coach_id, now());
    perform public.audit('member.reassign', 'member', new.id,
      jsonb_build_object('coach_id', old.coach_id), jsonb_build_object('coach_id', new.coach_id));
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.audit(
      case when new.status = 'inactive' then 'member.deactivate' else 'member.activate' end,
      'member', new.id, jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;

  -- BR-P4: an active member participates in every current/upcoming, non-closed season
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.season_participants (season_id, member_id)
    select s.id, new.id from public.seasons s
    where s.closed_at is null and s.ends_on >= public.app_today()
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger members_after_write after insert or update on public.members
  for each row execute function public.members_after_write();

-- ───────────────────────── profiles ─────────────────────────
create or replace function public.profiles_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_owner_session() or public.is_admin() then
    return new;
  end if;
  -- One-time bootstrap (scripts/create-admin.ts): the very first admin, nothing else.
  if new.role = 'admin' and not exists (select 1 from public.profiles where role = 'admin') then
    return new;
  end if;
  raise exception 'FORBIDDEN: only the admin creates staff accounts' using errcode = 'P0001';
end $$;
create trigger profiles_before_insert before insert on public.profiles
  for each row execute function public.profiles_before_insert();

create or replace function public.profiles_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'FORBIDDEN: profile id is immutable' using errcode = 'P0001';
  end if;
  if not public.is_owner_session() and not public.is_admin() then
    -- D16: staff may change only their own language, nothing else on their profile
    if old.id is distinct from public.current_actor() or not old.is_active
       or (to_jsonb(new) - 'locale') is distinct from (to_jsonb(old) - 'locale') then
      raise exception 'FORBIDDEN: staff can change only their own language' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- BR-P7: a coach cannot be deactivated while they still have active members
  if old.is_active and not new.is_active and exists (
    select 1 from public.members m where m.coach_id = old.id and m.status = 'active'
  ) then
    raise exception 'COACH_HAS_ACTIVE_MEMBERS: reassign active clients first' using errcode = 'P0001';
  end if;
  -- The system always keeps at least one active admin
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from public.profiles p
                     where p.role = 'admin' and p.is_active and p.id <> old.id) then
    raise exception 'LAST_ADMIN: the last active admin cannot be deactivated or demoted' using errcode = 'P0001';
  end if;
  if old.is_active is distinct from new.is_active then
    perform public.audit(case when new.is_active then 'coach.activate' else 'coach.deactivate' end,
      'profile', new.id, jsonb_build_object('is_active', old.is_active), jsonb_build_object('is_active', new.is_active));
  end if;
  if old.role is distinct from new.role then
    perform public.audit('profile.role', 'profile', new.id,
      jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
  end if;
  return new;
end $$;
create trigger profiles_before_update before update on public.profiles
  for each row execute function public.profiles_before_update();

-- ───────────────────────── seasons ─────────────────────────
create or replace function public.seasons_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- BR-S7: a season can never be created already closed or revealed — for any role
  if new.closed_at is not null or new.closed_by is not null or new.reveal_started_at is not null then
    raise exception 'FORBIDDEN: a season cannot be created closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger seasons_before_insert before insert on public.seasons
  for each row execute function public.seasons_before_insert();

create or replace function public.seasons_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_last date;
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'FORBIDDEN: season id is immutable' using errcode = 'P0001';
  end if;
  if old.closed_at is not null then
    -- BR-S7: closed seasons are immutable; only the reveal timestamp may be set (BR-S8)
    if (to_jsonb(new) - 'reveal_started_at') is distinct from (to_jsonb(old) - 'reveal_started_at') then
      raise exception 'SEASON_CLOSED: closed seasons are immutable' using errcode = 'P0001';
    end if;
    -- BR-S10: a preseason has no winners and no reveal
    if new.reveal_started_at is distinct from old.reveal_started_at and old.type = 'preseason' then
      raise exception 'FORBIDDEN: a preseason has no reveal' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.type is distinct from old.type and old.starts_on <= public.app_today() then
    raise exception 'FORBIDDEN: type can change only while scheduled' using errcode = 'P0001';
  end if;
  -- API: starts_on only editable while scheduled
  if new.starts_on is distinct from old.starts_on and old.starts_on <= public.app_today() then
    raise exception 'FORBIDDEN: starts_on can change only while scheduled' using errcode = 'P0001';
  end if;
  -- BR-S6: dates can never be moved so that existing entries or attendance fall outside the season
  if new.ends_on is distinct from old.ends_on or new.starts_on is distinct from old.starts_on then
    select max(d) into v_last from (
      select max(performed_on) as d from public.entries where season_id = old.id and voided_at is null
      union all
      select max(attended_on) from public.attendance where season_id = old.id and voided_at is null
    ) x;
    if v_last is not null and new.ends_on < v_last then
      raise exception 'VALIDATION: ends_on cannot be before existing entries (%)', v_last using errcode = 'P0001';
    end if;
  end if;
  if new.reveal_started_at is not null and new.closed_at is null then
    raise exception 'FORBIDDEN: reveal requires a closed season' using errcode = 'P0001';
  end if;
  -- BR-S7 / D21: closed only by the close operation, never by a direct update
  if new.closed_at is distinct from old.closed_at or new.closed_by is distinct from old.closed_by then
    if current_setting('arena.closing_season', true) is distinct from old.id::text then
      raise exception 'FORBIDDEN: a season is closed only by the close operation' using errcode = 'P0001';
    end if;
    -- BR-S5: close only when today > ends_on
    if not (public.app_today() > new.ends_on) then
      raise exception 'SEASON_NOT_ENDED: close allowed only after ends_on' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger seasons_before_update before update on public.seasons
  for each row execute function public.seasons_before_update();

create or replace function public.seasons_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Participants = all active members at creation (DATABASE_SCHEMA season_participants)
    insert into public.season_participants (season_id, member_id)
    select new.id, m.id from public.members m where m.status = 'active'
    on conflict do nothing;
    perform public.audit('season.create', 'season', new.id, null, to_jsonb(new));
  else
    if new.ends_on is distinct from old.ends_on then
      perform public.audit('season.extend', 'season', new.id,
        jsonb_build_object('ends_on', old.ends_on), jsonb_build_object('ends_on', new.ends_on));
    end if;
    if new.closed_at is not null and old.closed_at is null then
      perform public.audit('season.close', 'season', new.id, null,
        jsonb_build_object('closed_at', new.closed_at, 'closed_by', new.closed_by, 'type', new.type,
          'results', (select count(*) from public.season_results r where r.season_id = new.id)));
    end if;
    if new.reveal_started_at is distinct from old.reveal_started_at then
      perform public.audit('season.reveal', 'season', new.id, null,
        jsonb_build_object('reveal_started_at', new.reveal_started_at));
    end if;
  end if;
  return null;
end $$;
create trigger seasons_after_write after insert or update on public.seasons
  for each row execute function public.seasons_after_write();

-- ───────────────────────── season_participants ─────────────────────────
create or replace function public.participants_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_closed timestamptz;
begin
  if tg_op = 'UPDATE' and (new.season_id <> old.season_id or new.member_id <> old.member_id) then
    raise exception 'FORBIDDEN: only planned_sessions can change' using errcode = 'P0001';
  end if;
  select closed_at into v_closed from public.seasons where id = new.season_id;
  if v_closed is not null then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';
  end if;
  if not public.is_owner_session() then
    new.updated_by := public.current_actor();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger participants_before_write before insert or update on public.season_participants
  for each row execute function public.participants_before_write();

-- ───────────────────────── Season lock (D21) ─────────────────────────
-- Every entry/attendance write takes a SHARED lock on its season row; the close
-- operation takes the EXCLUSIVE lock. Writes therefore either finish before the close
-- reads its data, or wait for it and then fail with SEASON_CLOSED.
create or replace function public.lock_open_season(p_season_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_closed timestamptz;
begin
  select closed_at into v_closed from public.seasons where id = p_season_id for share;
  if not found then
    raise exception 'NO_ACTIVE_SEASON' using errcode = 'P0001';
  end if;
  if v_closed is not null then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';   -- AC-23
  end if;
end $$;

-- ───────────────────────── entries ─────────────────────────
create or replace function public.entry_value(p_category public.category_code, p_weight_kg numeric, p_reps int, p_km numeric)
returns numeric language sql immutable set search_path = '' as $$
  -- SCORING §2: e1RM (Epley) for lifts, reps for pull/push-ups, km for treadmill
  select case
    when p_category in ('deadlift','bench','squat') then p_weight_kg * (1 + p_reps::numeric / 30)
    when p_category in ('pullups','pushups') then p_reps
    else p_km
  end
$$;

create or replace function public.entries_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_season public.seasons;
  v_status public.member_status;
  v_today  date := public.app_today();
begin
  if not public.is_owner_session() then
    if public.is_admin() then
      -- BR-E3 / D7: admin may set a date within the active season (not in the future)
      new.performed_on := coalesce(new.performed_on, v_today);
      v_season := public.season_on(v_today);
      if v_season.id is null or new.performed_on < v_season.starts_on or new.performed_on > v_today then
        raise exception 'NO_ACTIVE_SEASON: date must be within the active season' using errcode = 'P0001';
      end if;
    elsif public.is_active_coach() then
      -- BR-E1: coaches log only for their own clients
      if not public.is_own_member(new.member_id) then
        raise exception 'FORBIDDEN: not your client' using errcode = 'P0001';
      end if;
      -- BR-E3: coaches cannot backdate; server Cairo date is used (AC-11)
      new.performed_on := v_today;
    else
      -- BR-X4: no acting staff user → no write, whatever the database role
      raise exception 'FORBIDDEN: no acting staff user' using errcode = 'P0001';
    end if;
    new.logged_by := public.current_actor();   -- AC-40: never taken from the payload
  end if;

  v_season := public.season_on(new.performed_on);
  -- BR-S4 / BR-S5: logging only while a season covers that day
  if v_season.id is null then
    raise exception 'NO_ACTIVE_SEASON' using errcode = 'P0001';
  end if;
  perform public.lock_open_season(v_season.id);
  new.season_id := v_season.id;

  -- BR-P5: inactive members cannot receive entries
  select status into v_status from public.members where id = new.member_id;
  if v_status is distinct from 'active' then
    raise exception 'MEMBER_INACTIVE' using errcode = 'P0001';
  end if;

  -- BR-X3: evidence must sit in this member's own folder for this season
  if new.photo_path is not null
     and new.photo_path not like 'entries/' || new.season_id::text || '/' || new.member_id::text || '/%' then
    raise exception 'VALIDATION: photo_path is not in this member''s evidence folder' using errcode = 'P0001';
  end if;

  new.value := public.entry_value(new.category, new.weight_kg, new.reps, new.km);
  new.created_at := now();
  new.voided_at := null; new.voided_by := null; new.void_reason := null;
  return new;
end $$;
create trigger entries_before_insert before insert on public.entries
  for each row execute function public.entries_before_insert();

create or replace function public.entries_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- BR-E7: any result auto-records attendance for that day (one per day, AC-15)
  insert into public.attendance (member_id, season_id, attended_on, source, logged_by)
  values (new.member_id, new.season_id, new.performed_on, 'auto', new.logged_by)
  on conflict (member_id, attended_on) where voided_at is null do nothing;
  return null;
end $$;
create trigger entries_after_insert after insert on public.entries
  for each row execute function public.entries_after_insert();

create or replace function public.entries_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_season public.seasons;
  v_reason text := nullif(btrim(coalesce(current_setting('app.reason', true), '')), '');
begin
  perform public.lock_open_season(old.season_id);
  if old.voided_at is not null then
    raise exception 'FORBIDDEN: voided entries cannot change' using errcode = 'P0001';
  end if;
  -- season_id is derived from the date and can never be changed (BR-S7, AC-41)
  if new.id <> old.id or new.member_id <> old.member_id or new.category <> old.category
     or new.logged_by <> old.logged_by or new.created_at <> old.created_at
     or new.season_id <> old.season_id then
    raise exception 'FORBIDDEN: immutable entry fields' using errcode = 'P0001';
  end if;

  if not public.is_owner_session() then
    if public.is_admin() then
      -- BR-E9 / D26: every admin correction carries a written reason
      if new.voided_at is not null then
        if nullif(btrim(coalesce(new.void_reason, '')), '') is null then
          raise exception 'VALIDATION: a reason is required' using errcode = 'P0001';
        end if;
      elsif v_reason is null then
        raise exception 'VALIDATION: a reason is required' using errcode = 'P0001';
      end if;
    elsif public.is_active_coach() then
      -- BR-E9: coach may only void (no value edits) ...
      if new.weight_kg is distinct from old.weight_kg or new.reps is distinct from old.reps
         or new.km is distinct from old.km or new.performed_on is distinct from old.performed_on
         or new.photo_path is distinct from old.photo_path or new.voided_at is null then
        raise exception 'FORBIDDEN: coaches can only void entries' using errcode = 'P0001';
      end if;
      -- ... an entry they submitted themselves; reassignment never transfers ownership (D26)
      if old.logged_by is distinct from public.current_actor() then
        raise exception 'FORBIDDEN: only the coach who submitted an entry can void it' using errcode = 'P0001';
      end if;
      -- ... on the same day only (AC-16)
      if old.performed_on <> public.app_today() then
        raise exception 'VOID_WINDOW_PASSED' using errcode = 'P0001';
      end if;
    else
      raise exception 'FORBIDDEN: no acting staff user' using errcode = 'P0001';
    end if;
  end if;

  if new.voided_at is not null then
    new.voided_at := now();
    if not public.is_owner_session() then
      new.voided_by := public.current_actor();
    end if;
  else
    new.voided_by := null; new.void_reason := null;
  end if;

  if new.performed_on is distinct from old.performed_on then
    -- Admin date change must stay within the same season and not in the future
    v_season := public.season_on(new.performed_on);
    if v_season.id is distinct from old.season_id or new.performed_on > public.app_today() then
      raise exception 'VALIDATION: date must stay within the season' using errcode = 'P0001';
    end if;
  end if;

  if new.photo_path is not null
     and new.photo_path not like 'entries/' || new.season_id::text || '/' || new.member_id::text || '/%' then
    raise exception 'VALIDATION: photo_path is not in this member''s evidence folder' using errcode = 'P0001';
  end if;

  new.value := public.entry_value(new.category, new.weight_kg, new.reps, new.km);
  return new;
end $$;
create trigger entries_before_update before update on public.entries
  for each row execute function public.entries_before_update();

create or replace function public.entries_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.voided_at is not null and old.voided_at is null then
    -- BR-E11: every void is audited (admin voids with their mandatory reason)
    perform public.audit('entry.void', 'entry', new.id, to_jsonb(old), to_jsonb(new), new.void_reason);
    -- BR-E10: last entry of the day voided → void the auto attendance (manual stays)
    if not exists (
      select 1 from public.entries e
      where e.member_id = new.member_id and e.performed_on = old.performed_on and e.voided_at is null
    ) then
      update public.attendance set voided_at = now(), voided_by = public.current_actor()
      where member_id = new.member_id and attended_on = old.performed_on
        and source = 'auto' and voided_at is null;
    end if;
  elsif to_jsonb(new) is distinct from to_jsonb(old) then
    perform public.audit('entry.edit', 'entry', new.id, to_jsonb(old), to_jsonb(new),
      current_setting('app.reason', true));
    if new.performed_on <> old.performed_on then
      -- keep attendance consistent with the moved entry (BR-E7 / BR-E10)
      insert into public.attendance (member_id, season_id, attended_on, source, logged_by)
      values (new.member_id, new.season_id, new.performed_on, 'auto', new.logged_by)
      on conflict (member_id, attended_on) where voided_at is null do nothing;
      if not exists (
        select 1 from public.entries e
        where e.member_id = new.member_id and e.performed_on = old.performed_on and e.voided_at is null
      ) then
        update public.attendance set voided_at = now(), voided_by = public.current_actor()
        where member_id = new.member_id and attended_on = old.performed_on
          and source = 'auto' and voided_at is null;
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger entries_after_update after update on public.entries
  for each row execute function public.entries_after_update();

-- ───────────────────────── attendance ─────────────────────────
create or replace function public.attendance_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_season public.seasons;
  v_status public.member_status;
  v_today  date := public.app_today();
begin
  -- Manual "Attended" from a staff user: same rules as entries (BR-E1, BR-E3, D7).
  -- Rows created by the entries trigger (depth > 1) inherit the entry's checks.
  if not public.is_owner_session() and pg_trigger_depth() = 1 then
    if public.is_admin() then
      new.attended_on := coalesce(new.attended_on, v_today);
      v_season := public.season_on(v_today);
      if v_season.id is null or new.attended_on < v_season.starts_on or new.attended_on > v_today then
        raise exception 'NO_ACTIVE_SEASON' using errcode = 'P0001';
      end if;
    elsif public.is_active_coach() then
      if not public.is_own_member(new.member_id) then
        raise exception 'FORBIDDEN: not your client' using errcode = 'P0001';
      end if;
      new.attended_on := v_today;
    else
      raise exception 'FORBIDDEN: no acting staff user' using errcode = 'P0001';
    end if;
    new.logged_by := public.current_actor();
    new.source := 'manual';
  end if;

  v_season := public.season_on(new.attended_on);
  if v_season.id is null then
    raise exception 'NO_ACTIVE_SEASON' using errcode = 'P0001';
  end if;
  perform public.lock_open_season(v_season.id);
  new.season_id := v_season.id;

  select status into v_status from public.members where id = new.member_id;
  if v_status is distinct from 'active' then
    raise exception 'MEMBER_INACTIVE' using errcode = 'P0001';
  end if;
  new.voided_at := null; new.voided_by := null;
  return new;
end $$;
create trigger attendance_before_insert before insert on public.attendance
  for each row execute function public.attendance_before_insert();

create or replace function public.attendance_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_open_season(old.season_id);
  -- Attendance is voided only as a consequence of voiding entries (BR-E10); there is
  -- no direct attendance edit in the product.
  if pg_trigger_depth() = 1 and not public.is_owner_session() then
    raise exception 'FORBIDDEN: attendance cannot be edited directly' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'voided_at' - 'voided_by') is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by')
     or old.voided_at is not null or new.voided_at is null then
    raise exception 'FORBIDDEN: attendance can only be voided' using errcode = 'P0001';
  end if;
  new.voided_at := now();
  return new;
end $$;
create trigger attendance_before_update before update on public.attendance
  for each row execute function public.attendance_before_update();

-- ───────────────────────── season_results ─────────────────────────
-- Written only inside the close operation (D21); never for a preseason (D20).
create or replace function public.season_results_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('arena.closing_season', true) is distinct from new.season_id::text then
    raise exception 'FORBIDDEN: results are written only by the close operation' using errcode = 'P0001';
  end if;
  new.frozen_at := now();
  -- D29: the member's status at close is recorded by the database, not by the caller
  select m.status = 'active' into new.member_active from public.members m where m.id = new.member_id;
  return new;
end $$;
create trigger season_results_before_insert before insert on public.season_results
  for each row execute function public.season_results_before_insert();

-- ───────────────────────── app_settings ─────────────────────────
create or replace function public.app_settings_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tv_key is distinct from old.tv_key then
    perform public.audit('tv_key.regenerate', 'app_settings', null, null, null);  -- key itself never logged
  end if;
  if new.gym_name is distinct from old.gym_name then
    perform public.audit('settings.gym_name', 'app_settings', null,
      jsonb_build_object('gym_name', old.gym_name), jsonb_build_object('gym_name', new.gym_name));
  end if;
  if new.tv_locale is distinct from old.tv_locale then
    perform public.audit('settings.tv_locale', 'app_settings', null,
      jsonb_build_object('tv_locale', old.tv_locale), jsonb_build_object('tv_locale', new.tv_locale));
  end if;
  return null;
end $$;
create trigger app_settings_after_update after update on public.app_settings
  for each row execute function public.app_settings_after_update();

-- ═════════════════════ Server-only write functions (D19, BR-X4) ═════════════════════
-- Executable by the service role only. The server passes the acting user it took from
-- the VERIFIED Supabase Auth session. These functions only establish that actor; every
-- business rule is then applied by the triggers above for that actor, so the service
-- role never bypasses authorization. BR-E6 (photo rule) needs the scoring module and is
-- checked by the API immediately before calling server_log_entry.
create or replace function public.assert_server_actor(p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_actor is null or not exists (
    select 1 from public.profiles p where p.id = p_actor and p.is_active
  ) then
    raise exception 'FORBIDDEN: acting user is not an active staff account' using errcode = 'P0001';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
end $$;

create or replace function public.server_log_entry(
  p_actor uuid,
  p_member_id uuid,
  p_category public.category_code,
  p_weight_kg numeric default null,
  p_reps int default null,
  p_km numeric default null,
  p_photo_path text default null,
  p_performed_on date default null
) returns public.entries
language plpgsql security definer set search_path = '' as $$
declare v_row public.entries;
begin
  perform public.assert_server_actor(p_actor);
  insert into public.entries (member_id, category, performed_on, weight_kg, reps, km, value, photo_path, logged_by, season_id)
  values (p_member_id, p_category, coalesce(p_performed_on, public.app_today()), p_weight_kg, p_reps, p_km, 0,
          p_photo_path, p_actor,
          '00000000-0000-0000-0000-000000000000')   -- placeholder; the trigger resolves the season
  returning * into v_row;
  return v_row;
exception
  when unique_violation then
    raise exception 'ALREADY_LOGGED_TODAY' using errcode = 'P0001';   -- BR-E2 / AC-10
end $$;

create or replace function public.server_void_entry(p_actor uuid, p_entry_id uuid, p_reason text default null)
returns public.entries
language plpgsql security definer set search_path = '' as $$
declare v_row public.entries;
begin
  perform public.assert_server_actor(p_actor);
  update public.entries set voided_at = now(), void_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_entry_id
  returning * into v_row;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return v_row;
end $$;

create or replace function public.server_edit_entry(
  p_actor uuid,
  p_entry_id uuid,
  p_reason text,
  p_weight_kg numeric default null,
  p_reps int default null,
  p_km numeric default null,
  p_performed_on date default null
) returns public.entries
language plpgsql security definer set search_path = '' as $$
declare v_row public.entries;
begin
  perform public.assert_server_actor(p_actor);
  perform set_config('app.reason', coalesce(p_reason, ''), true);
  update public.entries
     set weight_kg = coalesce(p_weight_kg, weight_kg),
         reps = coalesce(p_reps, reps),
         km = coalesce(p_km, km),
         performed_on = coalesce(p_performed_on, performed_on)
  where id = p_entry_id
  returning * into v_row;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception 'ALREADY_LOGGED_TODAY' using errcode = 'P0001';
end $$;

create or replace function public.server_log_attendance(p_actor uuid, p_member_id uuid, p_attended_on date default null)
returns public.attendance
language plpgsql security definer set search_path = '' as $$
declare v_row public.attendance;
begin
  perform public.assert_server_actor(p_actor);
  insert into public.attendance (member_id, season_id, attended_on, source, logged_by)
  values (p_member_id, '00000000-0000-0000-0000-000000000000', coalesce(p_attended_on, public.app_today()), 'manual', p_actor)
  returning * into v_row;
  return v_row;
exception
  when unique_violation then
    raise exception 'ALREADY_LOGGED_TODAY' using errcode = 'P0001';   -- API: 409 if already today
end $$;

-- ═════════════════════ Season close contract (D20, D21, D27) ═════════════════════
-- Used by the trusted server close operation over ONE connection and ONE transaction,
-- as the restricted role arena_season_closer:
--   begin;
--     select begin_season_close(season, admin);   -- authenticates admin, takes the lock
--     ... read entries / attendance / participants, compute with modules/scoring (TS) ...
--     select finish_season_close(season, results); -- validates completeness, freezes, closes
--   commit;                                        -- any error → everything rolls back
-- Scoring formulas are never duplicated here (D14).
create or replace function public.begin_season_close(p_season_id uuid, p_actor uuid)
returns public.seasons
language plpgsql security definer set search_path = '' as $$
declare v_season public.seasons;
begin
  if p_actor is null or not exists (
    select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.is_active
  ) then
    raise exception 'FORBIDDEN: only an active admin closes a season' using errcode = 'P0001';
  end if;
  -- Exclusive season lock BEFORE any data is read; concurrent closes and all
  -- entry/attendance writes (lock_open_season) queue behind it.
  select * into v_season from public.seasons where id = p_season_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_season.closed_at is not null then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';
  end if;
  if not (public.app_today() > v_season.ends_on) then
    raise exception 'SEASON_NOT_ENDED' using errcode = 'P0001';   -- BR-S5
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('arena.closing_season', p_season_id::text, true);
  return v_season;
end $$;

create or replace function public.finish_season_close(p_season_id uuid, p_results jsonb)
returns public.seasons
language plpgsql security definer set search_path = '' as $$
declare
  v_season public.seasons;
  v_count  int;
begin
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then
    raise exception 'VALIDATION: results must be a JSON array' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(coalesce(p_results, '[]'::jsonb));
  if current_setting('arena.closing_season', true) is distinct from p_season_id::text
     or public.current_actor() is null then
    raise exception 'CLOSE_NOT_STARTED: call begin_season_close in this transaction first' using errcode = 'P0001';
  end if;
  select * into v_season from public.seasons where id = p_season_id for update;
  if v_season.closed_at is not null then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';
  end if;

  if v_season.type = 'preseason' then
    -- BR-S10 / D20: freezes baselines; no results, no winners
    if v_count > 0 then
      raise exception 'VALIDATION: a preseason has no results' using errcode = 'P0001';
    end if;
  else
    insert into public.season_results (
      season_id, member_id, is_rookie, deadlift, bench, squat, pullups, pushups, treadmill,
      consistency, improvement_points, total, rank, rookie_rank, baseline_json, month_best_json)
    select p_season_id, r.member_id, r.is_rookie, r.deadlift, r.bench, r.squat, r.pullups, r.pushups,
           r.treadmill, r.consistency, r.improvement_points, r.total, r.rank, r.rookie_rank,
           coalesce(r.baseline_json, '{}'::jsonb), coalesce(r.month_best_json, '{}'::jsonb)
    from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as r(
      member_id uuid, is_rookie boolean, deadlift numeric, bench numeric, squat numeric,
      pullups numeric, pushups numeric, treadmill numeric, consistency numeric,
      improvement_points numeric, total numeric, rank int, rookie_rank int,
      baseline_json jsonb, month_best_json jsonb);

    -- Completeness (AC-42, AC-51): results only for participants, and EVERY participant has
    -- one — including members who became inactive during the season (D29).
    if exists (
      select 1 from public.season_results r
      where r.season_id = p_season_id and not exists (
        select 1 from public.season_participants sp
        where sp.season_id = r.season_id and sp.member_id = r.member_id)
    ) then
      raise exception 'INCOMPLETE_RESULTS: result for a non-participant' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.season_participants sp
      where sp.season_id = p_season_id and not exists (
        select 1 from public.season_results r
        where r.season_id = sp.season_id and r.member_id = sp.member_id)
    ) then
      raise exception 'INCOMPLETE_RESULTS: a participant has no result' using errcode = 'P0001';
    end if;
    -- BR-P5 / D29: a member inactive at close keeps their points but is never ranked.
    -- The status is taken from the database, never from the caller.
    if exists (
      select 1 from public.season_results r
      join public.members m on m.id = r.member_id
      where r.season_id = p_season_id and m.status = 'inactive'
        and (r.rank is not null or r.rookie_rank is not null)
    ) then
      raise exception 'VALIDATION: an inactive member cannot be ranked' using errcode = 'P0001';
    end if;
  end if;

  update public.seasons set closed_at = now(), closed_by = public.current_actor()
  where id = p_season_id
  returning * into v_season;
  return v_season;
end $$;

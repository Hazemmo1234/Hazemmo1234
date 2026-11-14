-- GYM ARENA — role helpers, business-rule triggers, audit triggers.
-- Time-based rules are enforced here AND in server code (USER_ROLES "Enforcement").

-- ───────────────────────── Role helpers ─────────────────────────
-- Privileged = service role (server) or a direct DB session (migrations/seed).
create or replace function public.is_privileged()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.role(), '') in ('', 'service_role')
     and auth.uid() is null
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active
  )
$$;

create or replace function public.is_active_coach()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'coach' and p.is_active
  )
$$;

-- "Own member" = members.coach_id = auth.uid() (USER_ROLES Enforcement)
create or replace function public.is_own_member(p_member_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_coach() and exists (
    select 1 from public.members m where m.id = p_member_id and m.coach_id = auth.uid()
  )
$$;

-- Actor for audit rows: the signed-in user, or app.actor_id set by server functions.
create or replace function public.current_actor()
returns uuid language sql stable set search_path = '' as $$
  select coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid)
$$;

-- Season active on a given Cairo date (BR-S3: derived from dates, not a toggle).
create or replace function public.season_on(p_day date)
returns public.seasons language sql stable set search_path = '' as $$
  select s.* from public.seasons s
  where p_day between s.starts_on and s.ends_on
  limit 1
$$;

create or replace function public.audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (public.current_actor(), p_action, p_entity_type, p_entity_id, p_before, p_after)
$$;
revoke execute on function public.audit(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;

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
    new.coach_id := auth.uid();
    new.status := 'active';
  end if;
  new.created_by := coalesce(new.created_by, public.current_actor());
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;
create trigger members_before_insert before insert on public.members
  for each row execute function public.members_before_insert();

create or replace function public.members_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.member_code is distinct from old.member_code then
    raise exception 'FORBIDDEN: member_code is immutable' using errcode = 'P0001';
  end if;
  -- USER_ROLES: coach cannot change coach_id or status
  if not public.is_admin() and not public.is_privileged()
     and (new.coach_id is distinct from old.coach_id or new.status is distinct from old.status) then
    raise exception 'FORBIDDEN: only the admin can reassign or change status' using errcode = 'P0001';
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
-- BR-P7: a coach cannot be deactivated while they still have active members
create or replace function public.profiles_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN: profile id is immutable' using errcode = 'P0001';
  end if;
  if old.is_active and not new.is_active and exists (
    select 1 from public.members m where m.coach_id = old.id and m.status = 'active'
  ) then
    raise exception 'COACH_HAS_ACTIVE_MEMBERS: reassign active clients first' using errcode = 'P0001';
  end if;
  if old.is_active is distinct from new.is_active then
    perform public.audit(case when new.is_active then 'coach.activate' else 'coach.deactivate' end,
      'profile', new.id, jsonb_build_object('is_active', old.is_active), jsonb_build_object('is_active', new.is_active));
  end if;
  return new;
end $$;
create trigger profiles_before_update before update on public.profiles
  for each row execute function public.profiles_before_update();

-- ───────────────────────── seasons ─────────────────────────
create or replace function public.seasons_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.closed_at is not null then
    -- BR-S7: closed seasons are immutable; only the reveal timestamp may be set (BR-S8)
    if (to_jsonb(new) - 'reveal_started_at') is distinct from (to_jsonb(old) - 'reveal_started_at') then
      raise exception 'SEASON_CLOSED: closed seasons are immutable' using errcode = 'P0001';
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
  if new.reveal_started_at is not null and new.closed_at is null then
    raise exception 'FORBIDDEN: reveal requires a closed season' using errcode = 'P0001';
  end if;
  -- BR-S5: close only when today > ends_on
  if new.closed_at is not null and not (public.app_today() > new.ends_on) then
    raise exception 'SEASON_NOT_ENDED: close allowed only after ends_on' using errcode = 'P0001';
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
        jsonb_build_object('closed_at', new.closed_at, 'closed_by', new.closed_by));
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
  if v_closed is not null and not public.is_privileged() then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';
  end if;
  new.updated_by := coalesce(public.current_actor(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger participants_before_write before insert or update on public.season_participants
  for each row execute function public.participants_before_write();

-- ───────────────────────── entries ─────────────────────────
create or replace function public.entries_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_season public.seasons;
  v_status public.member_status;
  v_today  date := public.app_today();
begin
  if not public.is_privileged() then
    if public.is_admin() then
      -- BR-E3 / D7: admin may set a date within the active season (not in the future)
      new.performed_on := coalesce(new.performed_on, v_today);
      v_season := public.season_on(v_today);
      if v_season.id is null or new.performed_on < v_season.starts_on or new.performed_on > v_today then
        raise exception 'NO_ACTIVE_SEASON: date must be within the active season' using errcode = 'P0001';
      end if;
    else
      -- BR-E3: coaches cannot backdate; server Cairo date is used
      new.performed_on := v_today;
    end if;
    new.logged_by := auth.uid();
  end if;

  v_season := public.season_on(new.performed_on);
  -- BR-S4 / BR-S5: logging only while a season covers that day
  if v_season.id is null then
    raise exception 'NO_ACTIVE_SEASON' using errcode = 'P0001';
  end if;
  if v_season.closed_at is not null then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';
  end if;
  new.season_id := v_season.id;

  -- BR-P5: inactive members cannot receive entries
  select status into v_status from public.members where id = new.member_id;
  if v_status is distinct from 'active' then
    raise exception 'MEMBER_INACTIVE' using errcode = 'P0001';
  end if;

  -- SCORING §2: value = e1RM (Epley) for lifts, reps for pull/push-ups, km for treadmill
  new.value := case
    when new.category in ('deadlift','bench','squat') then new.weight_kg * (1 + new.reps::numeric / 30)
    when new.category in ('pullups','pushups') then new.reps
    else new.km
  end;
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
  v_closed timestamptz;
  v_season public.seasons;
begin
  select closed_at into v_closed from public.seasons where id = old.season_id;
  if v_closed is not null then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';   -- AC-23
  end if;
  if old.voided_at is not null then
    raise exception 'FORBIDDEN: voided entries cannot change' using errcode = 'P0001';
  end if;
  if new.id <> old.id or new.member_id <> old.member_id or new.category <> old.category
     or new.logged_by <> old.logged_by or new.created_at <> old.created_at then
    raise exception 'FORBIDDEN: immutable entry fields' using errcode = 'P0001';
  end if;

  if not public.is_admin() and not public.is_privileged() then
    -- BR-E9: coach may only void (no value edits), same day only
    if new.weight_kg is distinct from old.weight_kg or new.reps is distinct from old.reps
       or new.km is distinct from old.km or new.performed_on is distinct from old.performed_on
       or new.photo_path is distinct from old.photo_path or new.season_id is distinct from old.season_id
       or new.voided_at is null then
      raise exception 'FORBIDDEN: coaches can only void entries' using errcode = 'P0001';
    end if;
    if old.performed_on <> public.app_today() then
      raise exception 'VOID_WINDOW_PASSED' using errcode = 'P0001';   -- AC-16
    end if;
  end if;

  if new.voided_at is not null then
    new.voided_at := now();
    new.voided_by := coalesce(public.current_actor(), new.voided_by);
  end if;

  if new.performed_on is distinct from old.performed_on then
    -- Admin date change must stay within the same (non-closed) season and not in the future
    v_season := public.season_on(new.performed_on);
    if v_season.id is distinct from old.season_id or new.performed_on > public.app_today() then
      raise exception 'VALIDATION: date must stay within the season' using errcode = 'P0001';
    end if;
  end if;

  new.value := case
    when new.category in ('deadlift','bench','squat') then new.weight_kg * (1 + new.reps::numeric / 30)
    when new.category in ('pullups','pushups') then new.reps
    else new.km
  end;
  return new;
end $$;
create trigger entries_before_update before update on public.entries
  for each row execute function public.entries_before_update();

create or replace function public.entries_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.voided_at is not null and old.voided_at is null then
    -- BR-E11: every void is audited
    perform public.audit('entry.void', 'entry', new.id, to_jsonb(old), to_jsonb(new));
    -- BR-E10: last entry of the day voided → void the auto attendance (manual stays)
    if not exists (
      select 1 from public.entries e
      where e.member_id = new.member_id and e.performed_on = old.performed_on and e.voided_at is null
    ) then
      update public.attendance set voided_at = now(), voided_by = public.current_actor()
      where member_id = new.member_id and attended_on = old.performed_on
        and source = 'auto' and voided_at is null;
    end if;
  else
    perform public.audit('entry.edit', 'entry', new.id, to_jsonb(old), to_jsonb(new));
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
  -- Manual attendance from a signed-in user: same date rules as entries (BR-E3, D7)
  if not public.is_privileged() and pg_trigger_depth() = 1 then
    if public.is_admin() then
      new.attended_on := coalesce(new.attended_on, v_today);
      v_season := public.season_on(v_today);
      if v_season.id is null or new.attended_on < v_season.starts_on or new.attended_on > v_today then
        raise exception 'NO_ACTIVE_SEASON' using errcode = 'P0001';
      end if;
    else
      new.attended_on := v_today;
    end if;
    new.logged_by := auth.uid();
    new.source := 'manual';
  end if;

  v_season := public.season_on(new.attended_on);
  if v_season.id is null then
    raise exception 'NO_ACTIVE_SEASON' using errcode = 'P0001';
  end if;
  if v_season.closed_at is not null then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';
  end if;
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
declare v_closed timestamptz;
begin
  select closed_at into v_closed from public.seasons where id = old.season_id;
  if v_closed is not null then
    raise exception 'SEASON_CLOSED' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'voided_at' - 'voided_by') is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by')
     or old.voided_at is not null or new.voided_at is null then
    raise exception 'FORBIDDEN: attendance can only be voided' using errcode = 'P0001';
  end if;
  if pg_trigger_depth() = 1 and not public.is_admin() and not public.is_privileged()
     and old.attended_on <> public.app_today() then
    raise exception 'VOID_WINDOW_PASSED' using errcode = 'P0001';
  end if;
  new.voided_at := now();
  new.voided_by := coalesce(public.current_actor(), new.voided_by);
  return new;
end $$;
create trigger attendance_before_update before update on public.attendance
  for each row execute function public.attendance_before_update();

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
  return null;
end $$;
create trigger app_settings_after_update after update on public.app_settings
  for each row execute function public.app_settings_after_update();

-- ───────────────────────── Transactional server functions ─────────────────────────
-- log_entry: insert entry (+ auto attendance via trigger) in one transaction.
-- SECURITY INVOKER → caller's RLS applies. Photo rule (BR-E6) is checked in server
-- code with the scoring module before calling this.
create or replace function public.log_entry(
  p_member_id uuid,
  p_category public.category_code,
  p_weight_kg numeric default null,
  p_reps int default null,
  p_km numeric default null,
  p_photo_path text default null,
  p_performed_on date default null,
  p_logged_by uuid default null
) returns public.entries
language plpgsql security invoker set search_path = '' as $$
declare v_row public.entries;
begin
  insert into public.entries (member_id, category, performed_on, weight_kg, reps, km, value, photo_path, logged_by, season_id)
  values (p_member_id, p_category, coalesce(p_performed_on, public.app_today()), p_weight_kg, p_reps, p_km, 0,
          p_photo_path, coalesce(p_logged_by, auth.uid()),
          -- placeholder; the trigger resolves the real season
          '00000000-0000-0000-0000-000000000000')
  returning * into v_row;
  return v_row;
exception
  when unique_violation then
    raise exception 'ALREADY_LOGGED_TODAY' using errcode = 'P0001';   -- BR-E2 / AC-10
end $$;

-- close_season: freeze results + set closed_at + audit, atomically (BR-S7).
-- Called by the server (service role) with results computed by modules/scoring.
create or replace function public.close_season(p_season_id uuid, p_actor uuid, p_results jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_season public.seasons;
begin
  if not public.is_privileged() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  select * into v_season from public.seasons where id = p_season_id for update;
  if v_season.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_season.closed_at is not null then raise exception 'SEASON_CLOSED' using errcode = 'P0001'; end if;
  if not (public.app_today() > v_season.ends_on) then
    raise exception 'SEASON_NOT_ENDED' using errcode = 'P0001';
  end if;

  insert into public.season_results (
    season_id, member_id, is_rookie, deadlift, bench, squat, pullups, pushups, treadmill,
    consistency, improvement_points, total, rank, rookie_rank, baseline_json, month_best_json, frozen_at)
  select p_season_id, r.member_id, r.is_rookie, r.deadlift, r.bench, r.squat, r.pullups, r.pushups,
         r.treadmill, r.consistency, r.improvement_points, r.total, r.rank, r.rookie_rank,
         coalesce(r.baseline_json, '{}'::jsonb), coalesce(r.month_best_json, '{}'::jsonb), now()
  from jsonb_to_recordset(p_results) as r(
    member_id uuid, is_rookie boolean, deadlift numeric, bench numeric, squat numeric,
    pullups numeric, pushups numeric, treadmill numeric, consistency numeric,
    improvement_points numeric, total numeric, rank int, rookie_rank int,
    baseline_json jsonb, month_best_json jsonb);

  update public.seasons set closed_at = now(), closed_by = p_actor where id = p_season_id;
end $$;
revoke execute on function public.close_season(uuid, uuid, jsonb) from public, anon, authenticated;

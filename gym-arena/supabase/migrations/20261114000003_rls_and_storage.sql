-- GYM ARENA — Row Level Security, grants, restricted close role and storage.
-- See docs/DATABASE_SCHEMA.md "RLS summary" and docs/SECURITY_SPECIFICATION.md.

alter table public.profiles             enable row level security;
alter table public.members              enable row level security;
alter table public.coach_assignments    enable row level security;
alter table public.seasons              enable row level security;
alter table public.season_participants  enable row level security;
alter table public.entries              enable row level security;
alter table public.attendance           enable row level security;
alter table public.season_results       enable row level security;
alter table public.daily_rank_snapshots enable row level security;
alter table public.audit_log            enable row level security;
alter table public.app_settings         enable row level security;

-- ───────────────────────── Table grants ─────────────────────────
-- Anonymous clients get nothing (TEST_PLAN: "Anonymous client cannot read any table").
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Staff (authenticated): no DELETE anywhere; server-written tables are read-only.
revoke delete, truncate on all tables in schema public from authenticated;
revoke insert, update on public.season_results, public.daily_rank_snapshots, public.audit_log,
  public.coach_assignments from authenticated;
revoke insert on public.app_settings from authenticated;
-- D19 / BR-X4: entries and attendance are written only by the server.
revoke insert, update on public.entries, public.attendance from authenticated;

-- ───────────────────────── Function grants ─────────────────────────
-- Nothing is executable by default; grant back exactly what each role needs.
revoke execute on all functions in schema public from public, anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated, service_role;

-- helpers used inside RLS policies and by staff sessions
grant execute on function
  public.app_today(), public.current_actor(), public.is_admin(), public.is_active_coach(),
  public.is_own_member(uuid), public.is_owner_session(), public.season_on(date)
  to authenticated, service_role;

-- server-only write path (D19): the service role, and only these functions
grant execute on function
  public.server_log_entry(uuid, uuid, public.category_code, numeric, int, numeric, text, date),
  public.server_void_entry(uuid, uuid, text),
  public.server_edit_entry(uuid, uuid, text, numeric, int, numeric, date),
  public.server_log_attendance(uuid, uuid, date)
  to service_role;

-- ───────────────────────── Policies ─────────────────────────
-- ── profiles: admin all; self read; self may update (trigger limits it to `locale`) ──
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_admin() or id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin() or id = auth.uid())
  with check (public.is_admin() or id = auth.uid());

-- ── members: admin all; coach own (BR-X1) ──
create policy members_select on public.members for select to authenticated
  using (public.is_admin() or (public.is_active_coach() and coach_id = auth.uid()));
create policy members_insert on public.members for insert to authenticated
  with check (public.is_admin() or (public.is_active_coach() and coach_id = auth.uid()));
-- coach_id / status / join date changes by coaches are rejected by members_before_update
create policy members_update on public.members for update to authenticated
  using (public.is_admin() or (public.is_active_coach() and coach_id = auth.uid()))
  with check (public.is_admin() or (public.is_active_coach() and coach_id = auth.uid()));

-- ── coach_assignments: read only (written by members trigger) ──
create policy coach_assignments_select on public.coach_assignments for select to authenticated
  using (public.is_admin() or public.is_own_member(member_id));

-- ── seasons: all staff read; admin writes (close/immutability rules in triggers) ──
create policy seasons_select on public.seasons for select to authenticated
  using (public.is_admin() or public.is_active_coach());
create policy seasons_insert on public.seasons for insert to authenticated
  with check (public.is_admin());
create policy seasons_update on public.seasons for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── season_participants ──
create policy participants_select on public.season_participants for select to authenticated
  using (public.is_admin() or public.is_own_member(member_id));
create policy participants_insert on public.season_participants for insert to authenticated
  with check (public.is_admin() or public.is_own_member(member_id));
create policy participants_update on public.season_participants for update to authenticated
  using (public.is_admin() or public.is_own_member(member_id))
  with check (public.is_admin() or public.is_own_member(member_id));

-- ── entries / attendance: read only for clients (writes: server_* functions) ──
create policy entries_select on public.entries for select to authenticated
  using (public.is_admin() or public.is_own_member(member_id));
create policy attendance_select on public.attendance for select to authenticated
  using (public.is_admin() or public.is_own_member(member_id));

-- ── season_results: all staff read; written only by the close operation ──
create policy season_results_select on public.season_results for select to authenticated
  using (public.is_admin() or public.is_active_coach());

-- ── daily_rank_snapshots: admin read; server writes ──
create policy snapshots_select on public.daily_rank_snapshots for select to authenticated
  using (public.is_admin());

-- ── audit_log: admin read; trigger writes ──
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- ── app_settings: admin read/update ──
create policy settings_select on public.app_settings for select to authenticated
  using (public.is_admin());
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────── Restricted season-close role (D27) ─────────────────────────
-- Used only by the server's close operation over a direct connection
-- (SEASON_CLOSE_DATABASE_URL). Created NOLOGIN: the login and password are set at
-- deployment time, never in a migration. It can read what scoring needs and call the
-- two close functions — nothing else (no direct write to any table).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'arena_season_closer') then
    create role arena_season_closer nologin noinherit;
  end if;
end $$;

grant usage on schema public to arena_season_closer;
grant select on public.seasons, public.season_participants, public.members,
  public.entries, public.attendance to arena_season_closer;
grant execute on function
  public.begin_season_close(uuid, uuid), public.finish_season_close(uuid, jsonb), public.app_today()
  to arena_season_closer;

create policy closer_read on public.seasons             for select to arena_season_closer using (true);
create policy closer_read on public.season_participants for select to arena_season_closer using (true);
create policy closer_read on public.members             for select to arena_season_closer using (true);
create policy closer_read on public.entries             for select to arena_season_closer using (true);
create policy closer_read on public.attendance          for select to arena_season_closer using (true);

-- ───────────────────────── Storage (private buckets) ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',  'avatars',  false, 5242880, array['image/webp','image/jpeg','image/png']),
  ('evidence', 'evidence', false, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

-- No UPDATE / DELETE policies: files cannot be overwritten or removed by clients.

-- avatars: members/{member_id}/{uuid}.webp — admin all; coach own members
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (public.is_admin() or (
    (storage.foldername(name))[1] = 'members'
    and exists (select 1 from public.members m
                where m.id::text = (storage.foldername(name))[2] and m.coach_id = auth.uid()
                  and public.is_active_coach()))));
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'members'
    and array_length(storage.foldername(name), 1) = 2
    and exists (select 1 from public.members m
                where m.id::text = (storage.foldername(name))[2]
                  and (public.is_admin() or (m.coach_id = auth.uid() and public.is_active_coach()))));

-- evidence: entries/{season_id}/{member_id}/{uuid}.webp — admin all; coach own (BR-X3)
create policy evidence_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (public.is_admin() or (
    (storage.foldername(name))[1] = 'entries'
    and exists (select 1 from public.members m
                where m.id::text = (storage.foldername(name))[3] and m.coach_id = auth.uid()
                  and public.is_active_coach()))));
-- Upload path must name a real, open season and a real member the caller may act on.
create policy evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence'
    and (storage.foldername(name))[1] = 'entries'
    and array_length(storage.foldername(name), 1) = 3
    -- `objects.name` is qualified on purpose: inside this subquery a bare `name` would be seasons.name
    and exists (select 1 from public.seasons s
                where s.id::text = (storage.foldername(objects.name))[2] and s.closed_at is null)
    and exists (select 1 from public.members m
                where m.id::text = (storage.foldername(name))[3]
                  and (public.is_admin() or (m.coach_id = auth.uid() and public.is_active_coach()))));

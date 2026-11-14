-- GYM ARENA — Row Level Security (docs/DATABASE_SCHEMA.md "RLS summary") + storage.
-- RLS is the source of truth; UI hiding is cosmetic (USER_ROLES "Enforcement").

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

-- Anonymous clients get nothing (TEST_PLAN: "Anonymous client cannot read any table").
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ── profiles: admin all; self ──
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_admin() or id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── members: admin all; coach own (BR-X1) ──
create policy members_select on public.members for select to authenticated
  using (public.is_admin() or (public.is_active_coach() and coach_id = auth.uid()));
create policy members_insert on public.members for insert to authenticated
  with check (public.is_admin() or (public.is_active_coach() and coach_id = auth.uid()));
-- coach_id/status changes by coaches are rejected by members_before_update
create policy members_update on public.members for update to authenticated
  using (public.is_admin() or (public.is_active_coach() and coach_id = auth.uid()))
  with check (public.is_admin() or (public.is_active_coach() and coach_id = auth.uid()));

-- ── coach_assignments: read only (written by members trigger) ──
create policy coach_assignments_select on public.coach_assignments for select to authenticated
  using (public.is_admin() or public.is_own_member(member_id));

-- ── seasons: all staff read; admin writes (closed immutability in trigger) ──
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

-- ── entries ──
create policy entries_select on public.entries for select to authenticated
  using (public.is_admin() or public.is_own_member(member_id));
-- Coach: own members, today (Cairo), active season — BR-E1, BR-E3, BR-S4.
-- Admin: within the active season (date rules enforced by entries_before_insert).
create policy entries_insert on public.entries for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_own_member(member_id)
        and performed_on = public.app_today()
        and logged_by = auth.uid()
        and exists (select 1 from public.seasons s
                    where public.app_today() between s.starts_on and s.ends_on
                      and s.closed_at is null))
  );
-- Admin until close; coach only void fields on own same-day rows (entries_before_update).
create policy entries_update on public.entries for update to authenticated
  using (public.is_admin() or (public.is_own_member(member_id) and performed_on = public.app_today()))
  with check (public.is_admin() or public.is_own_member(member_id));

-- ── attendance: same as entries ──
create policy attendance_select on public.attendance for select to authenticated
  using (public.is_admin() or public.is_own_member(member_id));
create policy attendance_insert on public.attendance for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_own_member(member_id)
        and attended_on = public.app_today()
        and logged_by = auth.uid()
        and exists (select 1 from public.seasons s
                    where public.app_today() between s.starts_on and s.ends_on
                      and s.closed_at is null))
  );
create policy attendance_update on public.attendance for update to authenticated
  using (public.is_admin() or (public.is_own_member(member_id) and attended_on = public.app_today()))
  with check (public.is_admin() or public.is_own_member(member_id));

-- ── season_results: all staff read; written only by close_season (service role) ──
create policy season_results_select on public.season_results for select to authenticated
  using (public.is_admin() or public.is_active_coach());

-- ── daily_rank_snapshots: admin read; server writes ──
create policy snapshots_select on public.daily_rank_snapshots for select to authenticated
  using (public.is_admin());

-- ── audit_log: admin read; server/trigger writes ──
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- ── app_settings: admin read/update ──
create policy settings_select on public.app_settings for select to authenticated
  using (public.is_admin());
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Column/verb grants for authenticated (RLS still applies). No DELETE anywhere.
revoke delete, truncate on all tables in schema public from authenticated;
revoke insert, update on public.season_results, public.daily_rank_snapshots, public.audit_log,
  public.coach_assignments from authenticated;
revoke insert on public.app_settings from authenticated;

-- ───────────────────────── Storage (private buckets) ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',  'avatars',  false, 5242880, array['image/webp','image/jpeg','image/png']),
  ('evidence', 'evidence', false, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

-- avatars: members/{member_id}/{uuid}.webp — admin all; coach own members
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (public.is_admin() or (
    (storage.foldername(name))[1] = 'members'
    and exists (select 1 from public.members m
                where m.id::text = (storage.foldername(name))[2] and m.coach_id = auth.uid()
                  and public.is_active_coach()))));
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (public.is_admin() or (
    (storage.foldername(name))[1] = 'members'
    and exists (select 1 from public.members m
                where m.id::text = (storage.foldername(name))[2] and m.coach_id = auth.uid()
                  and public.is_active_coach()))));

-- evidence: entries/{season_id}/{member_id}/{uuid}.webp — admin all; coach own (BR-X3)
create policy evidence_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (public.is_admin() or (
    (storage.foldername(name))[1] = 'entries'
    and exists (select 1 from public.members m
                where m.id::text = (storage.foldername(name))[3] and m.coach_id = auth.uid()
                  and public.is_active_coach()))));
create policy evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (public.is_admin() or (
    (storage.foldername(name))[1] = 'entries'
    and exists (select 1 from public.members m
                where m.id::text = (storage.foldername(name))[3] and m.coach_id = auth.uid()
                  and public.is_active_coach()))));

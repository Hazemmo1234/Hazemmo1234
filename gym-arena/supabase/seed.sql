-- GYM ARENA — local development seed (docs/TEST_PLAN.md "Test data").
-- LOCAL ONLY. Never run against production.
-- 1 admin, 3 coaches, 40 members (5 rookies, 2 inactive), one closed past season,
-- one active season with ~600 entries. Values are deterministic formulas of the
-- member index and day offset; dates are relative to today (Cairo) so the active
-- season always contains today.
--
-- Logins (password for all: Password123!)
--   admin@gym-arena.local · coach1@gym-arena.local · coach2@… · coach3@…
-- TV: /tv?key=dev-tv-key-0123456789abcdef0123456789abcdef
--
-- Note: season_results for the closed season are written in M1 (needs modules/scoring).

do $$
declare
  v_today   date := public.app_today();
  v_admin   uuid := '00000000-0000-4000-a000-000000000001';
  v_coaches uuid[] := array[
    '00000000-0000-4000-a000-000000000011'::uuid,
    '00000000-0000-4000-a000-000000000012'::uuid,
    '00000000-0000-4000-a000-000000000013'::uuid];
  v_users   jsonb := jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-4000-a000-000000000001', 'email', 'admin@gym-arena.local',  'name', 'Hazem (Admin)',  'role', 'admin'),
    jsonb_build_object('id', '00000000-0000-4000-a000-000000000011', 'email', 'coach1@gym-arena.local', 'name', 'Coach Omar',     'role', 'coach'),
    jsonb_build_object('id', '00000000-0000-4000-a000-000000000012', 'email', 'coach2@gym-arena.local', 'name', 'Coach Mariam',   'role', 'coach'),
    jsonb_build_object('id', '00000000-0000-4000-a000-000000000013', 'email', 'coach3@gym-arena.local', 'name', 'Coach Youssef',  'role', 'coach'));
  u         jsonb;
  v_past    uuid := '00000000-0000-4000-b000-000000000001';
  v_active  uuid := '00000000-0000-4000-b000-000000000002';
  v_past_start   date := v_today - 51;
  v_past_end     date := v_today - 21;
  v_active_start date := v_today - 20;
  v_active_end   date := v_today + 10;
  v_first   text[] := array['Ahmed','Mohamed','Mahmoud','Omar','Youssef','Karim','Mostafa','Ali','Hassan','Ibrahim',
                            'Nour','Salma','Mariam','Farida','Laila','Hana','Yasmin','Mona','Dina','Reem'];
  v_last    text[] := array['Hassan','Ali','Mostafa','Said','Fathy','Adel','Saleh','Kamal','Nabil','Ashraf'];
  v_member  uuid;
  i int; d int; v_day date; v_coach uuid; v_cat public.category_code;
  v_cats    public.category_code[] := array['deadlift','bench','squat','pullups','pushups','treadmill']::public.category_code[];
  v_rookie  boolean; v_inactive boolean;
  v_dl numeric; v_bp numeric; v_sq numeric; v_pu int; v_ps int; v_gain numeric;
  v_w numeric; v_reps int;
begin
  -- ── Staff (auth.users + identities + profiles) ──
  for u in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', (u->>'id')::uuid, 'authenticated', 'authenticated',
      u->>'email', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u->>'name'),
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), (u->>'id')::uuid, (u->>'id'),
      jsonb_build_object('sub', u->>'id', 'email', u->>'email', 'email_verified', true),
      'email', now(), now(), now());
    insert into public.profiles (id, full_name, role) values ((u->>'id')::uuid, u->>'name', (u->>'role')::public.user_role);
  end loop;

  update public.app_settings set tv_key = 'dev-tv-key-0123456789abcdef0123456789abcdef', gym_name = 'DFN GYM';

  -- ── Seasons (past closed + active). Members created after, so add participants explicitly.
  insert into public.seasons (id, name, type, starts_on, ends_on)
  values (v_past,   'Arena — Past (seed)',   'championship', v_past_start,   v_past_end),
         (v_active, 'Arena — Active (seed)', 'championship', v_active_start, v_active_end);

  -- ── Members: 1..33 regular, 34..38 rookies, 39..40 inactive ──
  for i in 1..40 loop
    v_rookie   := i between 34 and 38;
    v_inactive := i >= 39;
    v_coach    := v_coaches[1 + (i % 3)];
    v_member   := ('00000000-0000-4000-c000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.members (id, full_name, phone, photo_consent, coach_id, joined_on, created_by)
    values (v_member,
            v_first[1 + (i % 20)] || ' ' || v_last[1 + ((i * 7) % 10)],
            '+2010' || lpad((10000000 + i)::text, 8, '0'),
            (i % 4) <> 0,
            v_coach,
            case when v_rookie then v_active_start - 3 else v_past_start - 30 end,
            v_admin);
    insert into public.season_participants (season_id, member_id, planned_sessions)
    values (v_active, v_member, case when i % 5 = 0 then 8 + (i % 6) else 12 end)
    on conflict (season_id, member_id) do update set planned_sessions = excluded.planned_sessions;
    if not v_rookie then
      insert into public.season_participants (season_id, member_id) values (v_past, v_member)
      on conflict do nothing;
    end if;

    -- deterministic per-member strength profile
    v_dl := 60 + ((i * 7) % 80);          -- deadlift working weight (kg)
    v_bp := 40 + ((i * 5) % 50);
    v_sq := 50 + ((i * 11) % 70);
    v_pu := i % 10;                       -- pull-up reps
    v_ps := 10 + ((i * 3) % 30);          -- push-up reps
    v_gain := ((i * 13) % 20) / 100.0;    -- 0–19% progression over the active season

    -- Past season (baselines for the active one): every 2nd day, rotating categories
    if not v_rookie then
      for d in 0..30 loop
        continue when (i + d) % 2 <> 0;
        v_day := v_past_start + d;
        v_cat := v_cats[1 + ((i + d) % 6)];
        v_reps := 3 + ((i + d) % 3);
        insert into public.entries (member_id, season_id, category, performed_on, weight_kg, reps, km, value, logged_by)
        values (v_member, v_past, v_cat, v_day,
          case v_cat when 'deadlift' then v_dl when 'bench' then v_bp when 'squat' then v_sq end,
          case v_cat when 'pullups' then v_pu when 'pushups' then v_ps
                     when 'treadmill' then null else v_reps end,
          case v_cat when 'treadmill' then 2 + ((i + d) % 30) / 10.0 end,
          0, v_coach);
      end loop;
    end if;

    -- Active season up to today: ~60% of days, one rotating category + extra treadmill
    if not v_inactive then
      for d in 0..20 loop
        v_day := v_active_start + d;
        exit when v_day > v_today;
        continue when (i * 7 + d * 3) % 5 >= 3;
        v_cat := v_cats[1 + ((i + d) % 6)];
        v_reps := 3 + ((i * 2 + d) % 3);
        v_w := case v_cat when 'deadlift' then v_dl when 'bench' then v_bp when 'squat' then v_sq end;
        v_w := round(v_w * (1 + v_gain * d / 20.0) * 2) / 2;
        insert into public.entries (member_id, season_id, category, performed_on, weight_kg, reps, km, value, logged_by)
        values (v_member, v_active, v_cat, v_day, v_w,
          case v_cat when 'pullups' then v_pu + (d * (i % 6)) / 19
                     when 'pushups' then v_ps + (d * (i % 12)) / 19
                     when 'treadmill' then null else v_reps end,
          case v_cat when 'treadmill' then 2 + ((i + d) % 40) / 10.0 end,
          0, v_coach);
        if (i + d) % 4 = 0 and v_cat <> 'treadmill' then
          insert into public.entries (member_id, season_id, category, performed_on, km, value, logged_by)
          values (v_member, v_active, 'treadmill', v_day, 3 + ((i * d) % 25) / 10.0, 0, v_coach);
        end if;
      end loop;
      -- a few manual attendance-only days (BR-E7)
      for d in 0..20 loop
        v_day := v_active_start + d;
        exit when v_day > v_today;
        continue when (i * 7 + d * 3) % 5 <> 3 or (i + d) % 3 <> 0;
        insert into public.attendance (member_id, season_id, attended_on, source, logged_by)
        values (v_member, v_active, v_day, 'manual', v_coach)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  -- one voided entry (BR-E8) so the void path has data
  update public.entries set voided_at = now(), voided_by = v_admin, void_reason = 'seed: typo'
  where id = (select id from public.entries where season_id = v_active order by performed_on, member_id limit 1);

  -- inactive members (BR-P5) — after their history exists
  update public.members set status = 'inactive'
  where id in ('00000000-0000-4000-c000-000000000039', '00000000-0000-4000-c000-000000000040');

  -- close the past season (today > ends_on, BR-S5)
  update public.seasons set closed_at = now(), closed_by = v_admin where id = v_past;
end $$;

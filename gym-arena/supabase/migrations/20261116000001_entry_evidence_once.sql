-- GYM ARENA — M3: one evidence photo is the evidence for exactly ONE entry (BR-E6).
--
-- Add-only follow-up migration (D22: never edit an applied migration).
--
-- Why: the API refuses a photo already used by another entry, but that check and the
-- insert are two steps; two saves racing with the same photo could both pass the check.
-- A unique index makes the rule atomic in the database: whichever insert commits second
-- fails, however the requests interleave.
--
-- Scope: photo_path only (NULL = no photo, unaffected). Voided entries keep their photo
-- and still count (BR-E8), so a photo can never be "freed" and reused by undo-and-relog.
-- Ownership, folder, season and freshness checks are unchanged (entries_before_insert,
-- the API, storage policies).
--
-- Deployment: the index cannot be created while duplicates exist. The guard below stops
-- the migration with a clear message instead of creating a partial state; duplicates must
-- then be reviewed by a person (never rewritten automatically). On a fresh database or one
-- that only used the M3 API (which already refuses reuse) there are none.
-- Building the index takes a short lock on public.entries (plain CREATE INDEX inside the
-- migration transaction; the table is small for a single gym).

do $$
begin
  if exists (
    select 1 from public.entries
    where photo_path is not null
    group by photo_path having count(*) > 1
  ) then
    raise exception 'entries_photo_path_once: some evidence photos are attached to more than one entry; review them before applying this migration';
  end if;
end $$;

create unique index if not exists entries_photo_path_once
  on public.entries (photo_path)
  where photo_path is not null;

-- server_log_entry: identical to 20261114000002 except the unique-violation handler, which
-- now tells the two unique indexes apart instead of reporting every violation as
-- ALREADY_LOGGED_TODAY. Signature, grants (20261114000003) and behaviour are otherwise unchanged.
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
declare
  v_row public.entries;
  v_constraint text;
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
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'entries_photo_path_once' then
      raise exception 'VALIDATION: PHOTO_USED — this photo is already the evidence for another entry' using errcode = 'P0001';
    end if;
    raise exception 'ALREADY_LOGGED_TODAY' using errcode = 'P0001';   -- BR-E2 / AC-10
end $$;

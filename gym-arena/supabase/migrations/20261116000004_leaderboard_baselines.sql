-- GYM ARENA — M4 Leaderboards: baseline inputs for ranking a whole season.
--
-- Add-only migration (D22). DATA SELECTION ONLY — no scoring here (D14, D21): the TypeScript
-- scoring module computes every point and every rank from the raw inputs returned.
--
-- What it returns: for every participant of the season and every category, the member's
-- single best non-voided entry dated BEFORE the season start — exactly what the scoring
-- module needs for the baseline B (max), and for the rookie flag (any pre-season entry).
-- In-season entries and attendance are read separately in full.
--
-- Why the best row can be chosen by the stored `value`: values are exact multiples of a
-- fixed step (e1RM = k/60 kg for 0.5 kg × reps 3–5; reps are integers; km steps of 0.1), so
-- the 4-decimal rounding of `value` never reorders or merges two different exact values.
-- The raw weight_kg / reps / km are returned as text so the scoring module reads them exactly.
--
-- Security: SECURITY INVOKER (row security applies to whoever calls it), and executable ONLY
-- by service_role — i.e. by the server, after it has authenticated an active staff member
-- (modules/leaderboard). Coaches and anon cannot call it, so raw results of other coaches'
-- members never reach a browser. Fixed empty search_path.
--
-- Performance: one row per (participant, category) via DISTINCT ON over the existing index
-- entries_member_cat_day_idx (member_id, category, performed_on); history size no longer
-- matters to the leaderboard.
--
-- Rollback: drop function public.leaderboard_baselines(uuid);

create or replace function public.leaderboard_baselines(p_season_id uuid)
returns table (member_id uuid, category public.category_code, performed_on date, weight_kg text, reps int, km text)
language sql stable security invoker set search_path = '' as $$
  select distinct on (e.member_id, e.category)
         e.member_id, e.category, e.performed_on, e.weight_kg::text, e.reps, e.km::text
  from public.season_participants sp
  join public.seasons s on s.id = sp.season_id
  join public.entries e on e.member_id = sp.member_id and e.performed_on < s.starts_on and e.voided_at is null
  where sp.season_id = p_season_id
  order by e.member_id, e.category, e.value desc, e.id
$$;

revoke execute on function public.leaderboard_baselines(uuid) from public, anon, authenticated, service_role;
grant execute on function public.leaderboard_baselines(uuid) to service_role;

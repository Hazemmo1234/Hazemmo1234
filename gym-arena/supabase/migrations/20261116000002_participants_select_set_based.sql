-- GYM ARENA — Seasons performance: evaluate the season_participants read policy set-based.
--
-- Add-only follow-up migration (D22: never edit an applied migration).
--
-- Problem: participants_select was `is_admin() OR is_own_member(member_id)`. Both are
-- SECURITY DEFINER SQL functions, which PostgreSQL never inlines, so the policy ran per
-- participant row: is_admin() → profiles lookup, then is_own_member() → is_active_coach()
-- (another profiles lookup) + a members probe. A coach counting participants per season
-- (Seasons list, GET /api/seasons) paid that for every row of every season: 74,442 rows,
-- ~11 s on the test stack, past the 8 s statement timeout.
--
-- Fix: the SAME rule, evaluated once per query instead of once per row:
--   (select public.is_admin())                          → one InitPlan
--   member_id in (select public.own_member_ids())       → one hashed subplan
-- own_member_ids() returns exactly the members is_own_member() accepts: the caller is an
-- active coach AND the member's coach_id is the caller (current_actor()). Nothing else.
--
-- Security: who can read which participant row is unchanged —
--   * an active admin: every row (as before);
--   * an active coach: rows of their own members only (as before);
--   * an inactive coach / signed-out caller: nothing (as before; anon has no grant).
-- own_member_ids() reveals no more than the members policy already shows a coach (their
-- own member ids), takes no arguments (nothing client-supplied) and is executable only by
-- authenticated and service_role, like the other RLS helpers. Fixed empty search_path.
-- participants_update keeps is_own_member() (single-row writes; not a hot path).
--
-- Rollback: `alter policy participants_select on public.season_participants using
-- (public.is_admin() or public.is_own_member(member_id));` restores the old definition.

create or replace function public.own_member_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.id
  from public.members m
  where m.coach_id = public.current_actor()
    and (select public.is_active_coach())
$$;

revoke execute on function public.own_member_ids() from public, anon, authenticated, service_role;
grant execute on function public.own_member_ids() to authenticated, service_role;

alter policy participants_select on public.season_participants
  using ((select public.is_admin()) or member_id in (select public.own_member_ids()));

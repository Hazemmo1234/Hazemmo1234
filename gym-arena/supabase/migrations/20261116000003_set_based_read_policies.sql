-- GYM ARENA — evaluate the remaining member-scoped READ policies set-based.
--
-- Add-only follow-up migration (D22: never edit an applied migration).
--
-- Same root cause as 20261116000002 (season_participants): these policies were
-- `is_admin() OR is_own_member(member_id)`, two SECURITY DEFINER functions PostgreSQL never
-- inlines, evaluated once PER ROW (~0.16 ms each). The coach's Today screen, member card,
-- entry preview/save and activity log read every entry and attendance row of the coach's
-- clients, so the cost grows with every result ever logged: measured 650 ms for 3,994 entries
-- on the test stack, i.e. seconds per screen after a year of normal use, then the 8 s timeout.
--
-- Fix: the SAME rule, evaluated once per query (InitPlan + hashed subplan), using
-- public.own_member_ids() from 20261116000002 (active coach AND member.coach_id = caller).
--
-- Security: unchanged — admin: every row; active coach: rows of their own members only;
-- inactive coach / signed-out: nothing. Write policies, the server-only write functions and
-- the write triggers (which call is_own_member for one row) are untouched.
--
-- Rollback: alter each policy back to `using (public.is_admin() or public.is_own_member(member_id))`.

alter policy entries_select on public.entries
  using ((select public.is_admin()) or member_id in (select public.own_member_ids()));

alter policy attendance_select on public.attendance
  using ((select public.is_admin()) or member_id in (select public.own_member_ids()));

alter policy coach_assignments_select on public.coach_assignments
  using ((select public.is_admin()) or member_id in (select public.own_member_ids()));

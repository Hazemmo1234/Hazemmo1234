-- GYM ARENA — M2 Members: only an ACTIVE COACH can own a member (BR-P6, BR-P7;
-- M2 decisions 1 and 5).
--
-- Add-only follow-up migration. 20261114000002 is already recorded as applied on
-- existing local databases, so it is not edited: this file adds the rule on top of it.
-- Every statement is idempotent (create or replace), so it is safe on any database
-- that has 20261114000001–3, whether or not it was created before this rule existed.
--
-- Effect: checked when a member is created, when their coach changes, and when an
-- inactive member is reactivated. Admin accounts and deactivated coaches are rejected
-- with COACH_NOT_ACTIVE. Existing rows are never re-checked and no data changes.
-- The trigger bindings from 20261114000002 stay as they are; only the function bodies
-- are replaced (identical to before, plus the guard).

create or replace function public.assert_member_coach(p_coach_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_coach_id and p.role = 'coach' and p.is_active
  ) then
    raise exception 'COACH_NOT_ACTIVE: a member must be assigned to an active coach' using errcode = 'P0001';
  end if;
end $$;

-- Not callable through the API: only the member triggers (security definer) use it.
revoke execute on function public.assert_member_coach(uuid) from public, anon, authenticated, service_role;

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
  perform public.assert_member_coach(new.coach_id);
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

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
  -- reassignment always targets an active coach; a reactivated member needs one too
  if new.coach_id is distinct from old.coach_id
     or (new.status = 'active' and old.status is distinct from 'active') then
    perform public.assert_member_coach(new.coach_id);
  end if;
  new.updated_at := now();
  return new;
end $$;

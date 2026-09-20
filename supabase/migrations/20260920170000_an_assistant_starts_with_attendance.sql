-- AN ASSISTANT STARTS WITH ATTENDANCE (20 Sep 2026)
--
-- The user, asked whether `assistant` should carry attendance by default:
-- "yes assistant carry attendance by default".
--
-- ⚠ READ THE WORD "DEFAULT" LITERALLY, because the alternative reading would
-- undo yesterday's rule. `assistant` could have been admitted by
-- `can_run_register_for_class` the way an OWNER is — always, unconditionally.
-- That would make the member sheet's Attendance switch a control that cannot be
-- turned off for an assistant, which is exactly what R38 refused for an owner
-- ("a switch that cannot be turned off is not a switch") and why the sheet does
-- not draw one for them at all. So this is a DEFAULT, not a grant: the seat
-- starts with `can_attendance = true` and the owner may still take it away.
--
-- ⚠ AND IT IS A TRIGGER, NOT A LINE IN EACH RPC, for the reason this file has
-- had to learn twice (the register's membership test, 25 Aug; the door that
-- dropped an argument, 20 Sep): put the rule where the DECISION is made, not at
-- each caller that happens to make it today. An assistant seat can arrive from
-- `accept_business_invite` (invited as one) or `set_member_role` (relabelled to
-- one), and any door added later would otherwise have to remember.
--
-- ⚠ IT FIRES ON THE ROLE, NOT ON THE POWERS. `before update OF member_role`
-- fires only when that column is in the UPDATE's SET list, and
-- `set_member_powers` sets `can_attendance` / `can_refunds` / `updated_by` and
-- never `member_role` — so an owner switching an assistant's attendance OFF is
-- not overruled a moment later by this trigger. The guard on
-- `old.member_role is distinct from new.member_role` means re-saving an
-- unchanged role does not silently switch it back on either.
--
-- ⚠ NOTHING IS BACKFILLED because there is nothing to backfill: production
-- carries 35 owner, 5 visiting_faculty, 3 trainer and 2 staff seats and ZERO
-- assistants (the role is one day old). Counted before writing this, so the
-- migration makes no claim about rows it has not seen.

create or replace function public.assistant_starts_with_attendance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- only when the seat BECOMES an assistant; never on an ordinary powers update
  if new.member_role = 'assistant'
     and (tg_op = 'INSERT' or old.member_role is distinct from new.member_role) then
    new.can_attendance := true;
  end if;
  return new;
end;
$function$;

revoke all on function public.assistant_starts_with_attendance() from public, anon, authenticated, service_role;

comment on function public.assistant_starts_with_attendance() is
  'An assistant seat starts able to run the register (20 Sep 2026, the user: "yes assistant carry attendance by default"). A DEFAULT the owner can turn off, not a power the seat carries - it fires only when member_role becomes assistant, so set_member_powers is never overruled.';

drop trigger if exists business_members_assistant_attendance on public.business_members;
create trigger business_members_assistant_attendance
  before insert or update of member_role on public.business_members
  for each row execute function public.assistant_starts_with_attendance();

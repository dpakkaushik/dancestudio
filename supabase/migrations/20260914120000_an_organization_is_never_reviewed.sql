-- AN ORGANIZATION IS NEVER REVIEWED BY A HUMAN AGAIN (11 Sep 2026).
--
-- The user, ending the argument: *"org no more needs admin verification at all.
-- Org has only GST verification, that will be done by the API. Just the studio
-- needs admin verification."*
--
-- Two migrations ago the review MOVED to the studio and the organization kept
-- its old doors, unused but open — `request_org_verification` could still file
-- a request nobody would answer, `decide_org_verification` could still stamp a
-- tick that decides nothing, `add_org_proof_photo` could still take evidence
-- for a review that does not happen. A door nobody is meant to walk through is
-- one somebody eventually walks through, so they are closed here rather than
-- left standing out of politeness to the code that used to need them.
--
-- WHAT VERIFIES WHAT, NOW, IN ONE PLACE:
--   an ORGANIZATION  — its GST number, by `verify_gstin`. No admin, no queue,
--                      no photos, no links. The government API lands inside
--                      that one function and nothing else moves.
--   a STUDIO         — 5-10 photos of its space and its own public links, read
--                      by a DanceOS admin, who approves or rejects with a
--                      reason. Approval is `tenants.verified_at` — the badge.
--                      The badge plus its own subscription is what puts the
--                      studio on Discover.
--
-- WHAT IS KEPT, AND WHY:
--   * `profiles.verified_at` on the 19 organizations that carry it. It is
--     history — it is what grandfathered their studios' badges — and
--     `event_host_is_public` still accepts it so that not one event that is
--     live tonight goes dark. Nothing writes it any more.
--   * The 14 organization requests and 70 organization photos already on
--     record. They are what an admin looked at on a real date; deleting them
--     would be rewriting that.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. the three doors
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.request_org_verification();
drop function if exists public.decide_org_verification(uuid, boolean, text);
drop function if exists public.add_org_proof_photo(text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. the questions nobody is left to answer
-- ─────────────────────────────────────────────────────────────────────────────
-- Two organizations were still waiting in the queue. There is no longer a
-- process that answers them, and a request that cannot be decided is worse than
-- one that was withdrawn: it sits at the top of an admin's Pending tab forever.
-- They are withdrawn, with the reason written where the organization reads it.
update public.org_verification_requests
   set deleted_at = now(),
       note = coalesce(nullif(btrim(coalesce(note, '')), '') || ' · ', '')
              || 'Withdrawn on 11 Sep 2026: DanceOS no longer verifies organizations. Your GST number is entered in Settings, and each studio is verified on its own.'
 where tenant_id is null
   and status = 'pending'
   and deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. the trigger that told admins an organization was asking
-- ─────────────────────────────────────────────────────────────────────────────
-- Only a STUDIO can put a row in this table now, so the notification says so
-- without asking which kind it is.
create or replace function public.notify_org_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_studio text;
begin
  select p.full_name into v_name from public.profiles p where p.id = new.org_id;
  select t.name into v_studio from public.tenants t where t.id = new.tenant_id;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_platform_admins('people',
      coalesce(v_studio, 'A studio') || ' asked to be verified',
      'A studio run by ' || coalesce(v_name, 'an organization')
        || '. Check its links and photos, then approve or reject it in the verification queue.',
      '/admin/verifications');
  end if;
  return null;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. and the audit line
-- ─────────────────────────────────────────────────────────────────────────────
-- `decide_studio_verification` writes its own audit row ('studio.verify' /
-- 'studio.reject'), so this trigger is left with one job: putting the decision
-- into the conversation the owner opened about it.
create or replace function public.audit_org_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_studio text;
  v_thread uuid;
begin
  select t.name into v_studio from public.tenants t where t.id = new.tenant_id;

  select t.id into v_thread from public.support_threads t
    where t.request_id = new.id and t.deleted_at is null
    order by t.created_at limit 1;
  if v_thread is not null then
    insert into public.support_messages (thread_id, author_id, from_admin, body)
    values (v_thread, coalesce(new.decided_by, auth.uid(), new.org_id), true,
            case when new.status = 'approved'
                 then 'Approved — ' || coalesce(v_studio, 'the studio')
                      || ' is verified. Subscribe it to put it on Discover.'
                 else 'Not approved. ' || coalesce(nullif(btrim(coalesce(new.note, '')), ''),
                      'Show DanceOS more of the space and ask again from your hub.') end);
    update public.support_threads t set last_message_at = now(), status = 'open' where t.id = v_thread;
  end if;
  return null;
end;
$$;

comment on table public.org_verification_requests is
  'A STUDIO asking DanceOS to check it — its 5-10 photos and its public links. Approval stamps tenants.verified_at, the badge a subscription then turns into a listing. Rows with a null tenant_id are the ORGANIZATION reviews this replaced on 11 Sep 2026; an organization is not reviewed by anybody now, and its own paperwork is its GST number.';

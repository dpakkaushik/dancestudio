-- Hardening (Step 12b follow-up): the register's claim branch re-checks membership.
--
-- Step 12b closed this at the REVOCATION site: remove_tenant_member soft-deletes
-- the person's class_claims in the same act, so a removed assistant loses the
-- register. That guarantee is real today -- tenant_members carries only SELECT
-- policies across every migration, so that RPC is the one and only way a seat
-- can end -- but it is the weak form of the guarantee: it holds because every
-- path that ends a membership also happens to close the claims. The day a
-- second path appears (an offboarding job, a studio transfer, a hand-written
-- fix) the hole reopens silently, and it would stay invisible until somebody
-- hit it -- exactly how the maybeSingle() bug hid until a studio had two people.
--
-- So the test moves to where the decision is made. A confirmed attendance claim
-- now grants the register only WHILE its holder is still a live member of the
-- studio that owns the class. Nothing about Step 11's feature changes: a STAFF
-- assistant handed attendance still runs the register, because claim_person only
-- ever asks your own team, so every legitimate claim holder is a member. What
-- changes is that the grant now ends by itself when the seat does, whatever
-- ended it.
--
-- Second tightening, same shape: the claim branch never filtered soft-deleted
-- classes while the membership branch always did, so an assistant could run the
-- register on a class the studio had deleted. Both branches now read live
-- classes only.
--
-- Money/auth/RLS note (Rule 9): this function only ever loses authority -- no
-- new path is opened, nobody gains a power they lacked. Signature, volatility,
-- definer status and grants are unchanged, so check_in / undo_check_in /
-- give_spot / remove_from_waitlist pick the stricter test up untouched.

create or replace function public.can_run_register_for_class(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  -- the studio's own: an owner or trainer of the tenant that owns the class
  select exists (
    select 1 from public.classes c
    join public.tenant_members m on m.tenant_id = c.tenant_id
    where c.id = p_class_id
      and m.user_id = auth.uid()
      and m.member_role in ('owner', 'trainer')
      and m.deleted_at is null
      and c.deleted_at is null
  ) or exists (
    -- an assistant handed the attendance job (prototype 12390: "you hold
    -- attendance"). Any live member may hold it -- staff answer the desk and
    -- run the door -- but the claim is only ever as live as the seat behind it.
    select 1
    from public.class_claims cc
    join public.classes c on c.id = cc.class_id
    join public.tenant_members m
      on m.tenant_id = c.tenant_id and m.user_id = cc.user_id
    where cc.class_id = p_class_id
      and cc.user_id = auth.uid()
      and cc.status = 'confirmed'
      and cc.can_attendance = true
      and cc.deleted_at is null
      and c.deleted_at is null
      and m.deleted_at is null
  );
$$;

comment on function public.can_run_register_for_class(uuid) is
  'Who may run a class register: an owner or trainer of the studio that owns the class, or a confirmed assistant holding the attendance job WHILE still a live member of that studio. Both branches read live classes only.';

-- restated rather than relied upon: create or replace keeps grants, and this is
-- the shape every register RPC is gated on
revoke execute on function public.can_run_register_for_class(uuid) from public, anon;
grant execute on function public.can_run_register_for_class(uuid) to authenticated;

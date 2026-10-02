-- PAID AT THE DOOR, AND AN ANSWERED INVITE STAYS IN THE INBOX (2 Oct 2026).
--
-- 1 · The user: "option to complete due in attendance sheet for walk in students
--     with button next to check in called paid. for booked students it cant
--     change." A seat taken AT THE DOOR — a walk-in by name (user_id null,
--     20260929130000) or somebody booked in by the register
--     (`book_class_session_for_person`, 20260929120000, which books a priced class
--     at ₹0 with the money collected at the door) — has no payment anywhere, so
--     the register printed what was owed and had no way to say it was settled.
--     Two columns on the booking and one door. A seat the person booked THEMSELVES
--     is the payment rail's (Cashfree), and the door refuses it in words.
--     ⚠ DanceOS still moves no money (Step 13's limit): this RECORDS that the door
--     collected it.
--
-- 2 · The user: "check for requests invites and enquiries completely … visible in
--     the right section and doesnt get removed from the system." Answering a team
--     invite took it OFF the invitee's Inbox for good: the invitee holds no policy
--     on `business_invites`, and `my_pending_invites` is pending-only by design.
--     `my_answered_invites` is that read for the rows it leaves out — accepted,
--     declined or withdrawn — so the Inbox's Completed can keep them. Nothing is
--     deleted or changed; `my_pending_invites` is untouched.
--
-- ⚠ No begin/commit (Rule 18). ⚠ The audit column carries no FK into auth.users
--   (the 19 Sep undeletable-account lesson).

alter table public.class_bookings
  add column if not exists door_paid_at timestamptz,
  add column if not exists door_paid_by uuid;

comment on column public.class_bookings.door_paid_at is
  'When the register recorded the seat as paid AT THE DOOR (2 Oct 2026). Only for a seat taken at the door; a self-booked seat is the payment rail''s. DanceOS moves no money — this records that the door collected it.';

create or replace function public.set_door_paid(p_class_booking_id uuid, p_paid boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_b     public.class_bookings%rowtype;
  v_price integer;
  v_at    timestamptz;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select * into v_b from public.class_bookings b where b.id = p_class_booking_id and b.deleted_at is null;
  if not found then
    raise exception 'that seat is not on this register';
  end if;
  if v_b.status <> 'enrolled' then
    raise exception 'only a seat that is taken can be paid for';
  end if;
  if not public.can_run_register_for_class(v_b.class_id) then
    raise exception 'only somebody running this register can mark a seat paid';
  end if;
  select c.price_inr into v_price from public.classes c where c.id = v_b.class_id;
  if coalesce(v_price, 0) = 0 then
    raise exception 'this class is free — nothing is due at the door';
  end if;
  /* a seat the person booked themselves is the rail's, never the door's */
  if v_b.user_id is not null and v_b.created_by = v_b.user_id then
    raise exception 'they booked this seat themselves — what they paid is on their booking, not the door';
  end if;
  if v_b.user_id is not null and exists (
    select 1 from public.orders o
     where o.user_id = v_b.user_id and o.session_id = v_b.session_id
       and o.status in ('paid', 'refund_pending', 'refunded')
  ) then
    raise exception 'this seat was paid online — the door cannot change it';
  end if;
  v_at := case when p_paid then now() else null end;
  update public.class_bookings
     set door_paid_at = v_at,
         door_paid_by = case when p_paid then v_user else null end,
         updated_by = v_user
   where id = v_b.id;
  return v_at;
end;
$$;

revoke all on function public.set_door_paid(uuid, boolean) from public, anon;
grant execute on function public.set_door_paid(uuid, boolean) to authenticated, service_role;

comment on function public.set_door_paid(uuid, boolean) is
  'The register records a door seat as paid (or takes it back). Walk-ins and seats booked in at the door only; refused for a free class and for a seat the person booked or paid for themselves.';

create or replace function public.my_answered_invites()
returns table (
  invite_id uuid,
  business_id uuid,
  business_name text,
  member_role text,
  status text,
  created_at timestamptz,
  answered_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.business_id, t.name, i.member_role, i.status, i.created_at, i.updated_at
    from public.business_invites i
    join public.businesses t on t.id = i.business_id
   where (i.email = public.my_auth_email() or i.user_id = auth.uid())
     and i.status in ('accepted', 'declined', 'revoked')
     and i.deleted_at is null
     and t.deleted_at is null
   order by i.updated_at desc
   limit 100
$$;

revoke all on function public.my_answered_invites() from public, anon;
grant execute on function public.my_answered_invites() to authenticated, service_role;

comment on function public.my_answered_invites() is
  'The team invites put to me that are over — accepted, declined or withdrawn — for the Inbox''s Completed (2 Oct 2026). Scoped to the caller inside; my_pending_invites is the live half.';

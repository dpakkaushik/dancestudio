-- THE SELF-LOG IS THE OWNER'S, NOT EVERY SEATED TEACHER'S (26 Sep 2026)
--
-- `20260926090000` taught `notify_class_person` to raise the LOG the user asked
-- for — "You take {class} at {studio}" — where an ask would otherwise have gone
-- out: a studio owner taking their own class is seated CONFIRMED at birth, so the
-- Inbox line and this notification are the only record that anything happened.
-- Its test for "the owner took their own class" was `new.user_id = new.created_by`
-- on an INSERT that is already confirmed — which is true of the self-seat, and
-- ALSO true of any confirmed row a service-role caller writes in the teacher's
-- own name. `rls-proof-notifications` found it within the hour: the harness seats
-- a teacher that way (`Seat-Teacher` in proof-lib), and the trainer read "You
-- take …" for a class they were then ASKED onto — two notifications where the
-- proof expects one. Nothing in the app writes such a row, so no user saw it;
-- but a condition that a service-role write can satisfy is not the condition
-- that was meant.
--
-- The condition is the fact itself now: the seated person HOLDS THE OWNER SEAT on
-- the business. Same body otherwise — edited out of the catalog by asserted
-- anchor, never re-typed (Rule 16); no signature, no grant, no policy, no row.

do $$
declare
  v_def text;
  v_from text := E'  if tg_op = ''INSERT'' and new.status = ''confirmed'' and new.user_id = new.created_by\n'
              || E'     and exists (select 1 from public.businesses b where b.id = new.business_id and b.type = ''studio'') then';
  v_to   text := E'  if tg_op = ''INSERT'' and new.status = ''confirmed'' and new.user_id = new.created_by\n'
              || E'     and exists (select 1 from public.businesses b where b.id = new.business_id and b.type = ''studio'')\n'
              || E'     -- 26 Sep 2026 (later): the OWNER seat, not merely "wrote it in their own name" — a service-role\n'
              || E'     -- seat of somebody else''s teacher satisfied the old test (rls-proof-notifications found it)\n'
              || E'     and exists (select 1 from public.business_members m where m.business_id = new.business_id\n'
              || E'                   and m.user_id = new.user_id and m.member_role = ''owner'' and m.deleted_at is null) then';
  v_n int;
begin
  select pg_get_functiondef('public.notify_class_person()'::regprocedure) into v_def;
  v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  if v_n <> 1 then
    raise exception 'notify_class_person: expected the self-log anchor exactly once, found %', v_n;
  end if;
  execute replace(v_def, v_from, v_to);
end $$;

comment on function public.notify_class_person() is
  'Raises the ask, the answer, and — since 26 Sep 2026 — the LOG when a studio OWNER takes their own class (seated confirmed at birth, nobody asked). The owner seat is the test, not who wrote the row.';

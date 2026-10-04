-- ⚠ THREE KINDS OF ENQUIRY (4 Oct 2026, the user: "3 broad enquiries — as a
-- Choreographer, Performer, Judge/guest … limit the options or list will be
-- huge", then three rounds of "trim down even more"). Celebrations, corporate,
-- private sessions and collaboration are clubbed into what the person is asked
-- to DO; "Invite as Judge" becomes Judge / Guest and keeps its key.
--
-- ⚠⚠ AND EVERY ENQUIRY SENT BEFORE IT IS TAKEN DOWN (the user: "remove all old
-- enquiries entirely so the data doesnt clash"). Counted on production first:
-- 21 live enquiries, every one of an old kind (celebration 3, collab 2,
-- corporate 3, judge 1, private 12), with 20 quotes, 1 open ending and 53
-- notifications pointing at them. NO order, payment or refund stands behind any
-- of them — nothing went through Cashfree. What does stand behind 11 quotes is
-- money RECORDED AS RECEIVED by the business (₹30,000 on 11ft down and ₹12,500 on
-- the user's own artist page among them), so taking these down takes that off
-- the Earnings ledgers too; the user asked for it knowing the screens read the
-- rows. ⚠ They are SOFT-deleted (Rule 3): gone from every screen and every
-- figure, and one UPDATE brings any of them back. No business has a stored
-- `enquiry_types` list, so nothing there moves.
--
-- No `begin;`/`commit;` — `db push` wraps the file (Rule 18).

-- 1 · take down every enquiry and everything hanging off it. The notifications
--     that open one go too, so no bell row leads to a page that is not there.
update public.notifications n
   set deleted_at = now()
  from public.enquiries e
 where n.href = '/inbox/enquiries/' || e.id
   and n.deleted_at is null;

update public.enquiry_endings set deleted_at = now() where deleted_at is null;
update public.enquiry_quote_items set deleted_at = now() where deleted_at is null;
update public.enquiry_quotes set deleted_at = now() where deleted_at is null;
update public.enquiries set deleted_at = now() where deleted_at is null;

-- 2 · a LIVE enquiry is one of the three kinds, and nothing else. A taken-down one
--     keeps the kind it was sent as, so history reads as it was if it ever returns.
alter table public.enquiries drop constraint enquiries_type_key_check;
alter table public.enquiries
  add constraint enquiries_type_key_check
  check (
    type_key = any (array['choreographer', 'performer', 'judge'])
    or (deleted_at is not null and type_key = any (array['celebration', 'corporate', 'private', 'collab']))
  );

comment on column public.enquiries.type_key is
  'What the enquiry is for: choreographer, performer or judge (Judge / Guest) since 4 Oct 2026. celebration, corporate, private and collab survive only on soft-deleted history (enquiries_type_key_check).';

-- 3 · send_enquiry SENDS only the three. The LIVE body is edited by two asserted
--     anchors (never re-typed), so its signature and grants stay exactly as they are.
do $$
declare
  v_def text;
  a1 constant text := $a$if p_type_key not in ('celebration', 'corporate', 'judge', 'private', 'collab') then$a$;
  b1 constant text := $a$if p_type_key not in ('choreographer', 'performer', 'judge') then$a$;
  a2 constant text := $a$raise exception 'only an artist can be invited to judge';$a$;
  b2 constant text := $a$raise exception 'only an artist can be invited as a judge or guest';$a$;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'send_enquiry') <> 1 then
    raise exception 'expected exactly one send_enquiry';
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'send_enquiry';
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then
    raise exception 'send_enquiry: the type test is not where it was';
  end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then
    raise exception 'send_enquiry: the judge refusal is not where it was';
  end if;
  execute replace(replace(v_def, a1, b1), a2, b2);
end $$;

-- ⚠ A CREW TAKES NO ENQUIRIES (4 Oct 2026, the user: "remove enquiries for
-- crew"). Undoes the door `20260918160000_a_crew_can_be_asked` opened.
--
-- Counted on production before writing: ONE live crew enquiry (Gurugram
-- Rockers, a celebration from a demo account, quoted ₹30,000, the quote still
-- `sent`) — no order, no payment, no refund behind it. So nothing here moves
-- money; it is taken down, not settled.
--
-- No `begin;`/`commit;` — `db push` wraps the file (Rule 18).

-- 1 · send_enquiry refuses a crew. The LIVE body is edited by two asserted
--     anchors (never re-typed), so its signature and grants stay — the app no
--     longer sends `p_crew_id`, and the argument keeps its default so old
--     named-argument calls still resolve and are refused in words.
do $$
declare
  v_def text;
  v_new text;
  a1 constant text := $a$if (p_business_id is null) = (p_crew_id is null) then$a$;
  b1 constant text := $a$if p_crew_id is not null or p_business_id is null then$a$;
  a2 constant text := $a$raise exception 'an enquiry goes to a business or to a crew';$a$;
  b2 constant text := $a$raise exception 'an enquiry goes to a studio or an artist — a crew takes no enquiries';$a$;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'send_enquiry') <> 1 then
    raise exception 'expected exactly one send_enquiry';
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'send_enquiry';
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then
    raise exception 'send_enquiry: the target test is not where it was';
  end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then
    raise exception 'send_enquiry: the target refusal is not where it was';
  end if;
  v_new := replace(replace(v_def, a1, b1), a2, b2);
  execute v_new;
end $$;

-- 2 · the crew enquiries that exist, and their quotes, are taken down — soft
--     deleted (Rule 3), nothing destroyed
update public.enquiry_quotes
   set deleted_at = now()
 where crew_id is not null
   and deleted_at is null;

update public.enquiries
   set deleted_at = now()
 where crew_id is not null
   and deleted_at is null;

-- 3 · and the table keeps the rule: a live enquiry never names a crew. A
--     soft-deleted one still may, so history reads as it was.
alter table public.enquiries
  add constraint enquiries_no_live_crew check (crew_id is null or deleted_at is not null);

comment on column public.enquiries.crew_id is
  'History only since 4 Oct 2026: a crew takes no enquiries. A live row never names one (enquiries_no_live_crew).';

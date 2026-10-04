-- ⚠ ONLY A STUDIO SELLS A MEMBERSHIP (4 Oct 2026, the user: "remove membership
-- creation from artists and remove the ones previously created or purchased.
-- memberships can only be created by studios"). Rule 9: memberships are money.
--
-- Asked before writing, the user chose: the one PAID artist pass (₹20,000,
-- Cashfree SANDBOX, a demo account) is removed with NO refund — its payment row
-- stays on the ledger as history — and the one seat already booked with an
-- artist pass is KEPT (only the pass goes; its use row stays as history).
--
-- No `begin;`/`commit;` — `db push` wraps the file (Rule 18).

-- 1 · save_membership refuses anything but a studio. The LIVE body is edited by
--     two asserted anchors (never re-typed), so its signature and grants stay.
do $$
declare
  v_def text;
  v_new text;
  a1 constant text := $a$if v_type not in ('studio', 'artist_page') then$a$;
  b1 constant text := $a$if v_type is distinct from 'studio' then$a$;
  a2 constant text := $a$raise exception 'a membership is a studio''s or an artist''s';$a$;
  b2 constant text := $a$raise exception 'only a studio sells memberships';$a$;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'save_membership') <> 1 then
    raise exception 'expected exactly one save_membership';
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_membership';
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then
    raise exception 'save_membership: the type test is not where it was';
  end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then
    raise exception 'save_membership: the type refusal is not where it was';
  end if;
  v_new := replace(replace(v_def, a1, b1), a2, b2);
  execute v_new;
end $$;

-- 2 · the artist memberships that exist, and every pass bought from one, are
--     taken down — soft deleted (Rule 3), nothing destroyed, no money moved
update public.memberships m
   set deleted_at = now()
  from public.businesses b
 where b.id = m.business_id
   and b.type = 'artist_page'
   and m.deleted_at is null;

update public.membership_passes p
   set deleted_at = now()
  from public.memberships m
  join public.businesses b on b.id = m.business_id
 where m.id = p.membership_id
   and b.type = 'artist_page'
   and p.deleted_at is null;

-- 3 · no class takes an artist's pass any more, and none can be set to
update public.classes
   set allows_artist_memberships = false
 where allows_artist_memberships;

alter table public.classes
  add constraint classes_no_artist_memberships check (not allows_artist_memberships);

comment on column public.classes.allows_artist_memberships is
  'Always false since 4 Oct 2026: only a studio sells memberships. Kept so the class RPCs keep their signatures.';

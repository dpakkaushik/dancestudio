-- A class belongs to a STUDIO or to an ARTIST PAGE — never to the organization
-- itself. (17 Sep 2026, the user: "organization home tab should not have classes
-- options. classes can only be created by users with artist subscription and
-- studios.")
--
-- Until now the only thing between an organization and a class on its own
-- hosting row (R15, `businesses.type = 'org'`) was the app not drawing the door:
-- `create_class_with_session` checks membership, the organization OWNS that row,
-- and /business/{host}/classes answered by URL. A rule the database does not
-- keep holds only at the door you went in by (11 Sep 2026). Two rules, one
-- trigger:
--   * an 'org' business never carries a class — its classes are its studios';
--   * an 'artist_page' carries a class only while its owner's Artist plan is
--     live (`artist_plan_active`, the same test that sizes the gallery and
--     prints the ARTIST badge) — the plan is what makes somebody an artist, and
--     lapsing it closes the register the way it closes the other artist tools.
-- A studio is gated by nothing new here: its subscription decides whether it is
-- PUBLIC, not whether it may teach — a studio that has not subscribed yet still
-- prepares its classes.
--
-- BEFORE INSERT, not inside the RPC — the pattern of `events_need_a_verified_gstin`
-- (20260914090000): the RPC keeps its signature (Rule 4; two overloads of one
-- name is how PostgREST stops finding either), a direct insert or a future
-- importer meets the same wall, and UPDATE is left alone so a class an artist
-- published before their plan lapsed keeps its life and can still be edited.
-- Triggers fire alphabetically by name: `classes_belong_…` runs before the slug,
-- suspension and room triggers, so a refused row costs nothing else.
--
-- `why_no_class(uuid)` is the same decision as ONE SENTENCE, for a screen to
-- print before the form is drawn — null means "go ahead" (the `why_no_event`
-- shape). Live data at writing: 0 classes on 'org' rows, 2 on artist pages whose
-- owners hold the plan, 17 on studios; nothing existing is touched.
--
-- RLS impact: NONE. No policy changes. One STABLE definer function readable by
-- authenticated (it reads through `business_owner` and `artist_plan_active`,
-- which already answer authenticated callers), one trigger function executable
-- by nobody.

create or replace function public.why_no_class(p_business_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  select b.type into v_type
    from public.businesses b
   where b.id = p_business_id and b.deleted_at is null;
  if v_type is null then
    return 'That business does not exist';
  end if;
  if v_type = 'org' then
    return 'An organization does not run classes — open one inside a studio, or on an artist page';
  end if;
  if v_type = 'artist_page' and not public.artist_plan_active(public.business_owner(p_business_id)) then
    return 'Classes on an artist page need a live Artist plan';
  end if;
  return null;
end;
$$;

comment on function public.why_no_class(uuid) is
  'The one sentence between a business and a new class, or null (17 Sep 2026): an organization''s hosting row never carries one; an artist page only while its owner''s Artist plan is live. The trigger classes_belong_to_a_studio_or_an_artist raises the same words.';
revoke execute on function public.why_no_class(uuid) from public, anon;
grant execute on function public.why_no_class(uuid) to authenticated;

create or replace function public.guard_class_business_teaches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_why text;
begin
  v_why := public.why_no_class(new.business_id);
  if v_why is not null then
    raise exception '%', v_why;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_class_business_teaches() from public, anon, authenticated;

drop trigger if exists classes_belong_to_a_studio_or_an_artist on public.classes;
create trigger classes_belong_to_a_studio_or_an_artist
  before insert on public.classes
  for each row execute function public.guard_class_business_teaches();

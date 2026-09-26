-- 26 Sep 2026: A PERSON OPENS A STUDIO, AND NOBODY IS ASKED TO SAY YES TO
-- THEMSELVES.
--
-- The user: "Move Studio creation from org and allow user and artist to create
-- studios now from studios tab at home in a section. verification and
-- subscription process remains the same for the studio … so basically user signs
-- up as a user can subscribe to become an artist and also has an option to open
-- or run a studio. even artist can open a studio the same way and when the same
-- user is creating classes from studio or as an artist using the same studio or
-- artist profile no verification is required but keeps a log in the inbox."
--
-- WHAT KEPT A STUDIO AN ORGANIZATION'S was three lines, not a model: one in
-- `why_no_studio()` (the creation gate the hub prints and
-- `create_business_with_owner` raises), one in `subscribe` (the studio branch),
-- and one in the app's create action. Everything downstream — the badge
-- (`request_studio_verification`), the photos (`add_studio_photo`, keyed on the
-- uploader's own folder), the subscription mandate, the studio's own home, the
-- profile switcher, THIS STUDIO in Settings — has been keyed on the OWNER SEAT
-- since 14 Sep, never on `profiles.role`. So the two database lines go, the cap
-- stays (fifteen studios per account, whoever the account is), and nothing about
-- verification or money changes shape: a person's studio is born unlisted,
-- earns the badge from an admin, and reaches Discover with its own ₹1,200
-- mandate exactly as an organization's does.
--
-- THE SECOND HALF IS CONSENT WITH NOBODY TO ASK. Since 18 Sep a studio's class
-- waits for its TEACHER to say yes and an artist's class at a studio waits for
-- the STUDIO to say yes — two-sided consent, enforced by
-- `classes_publish_needs_a_yes`. When the same person is on both sides there is
-- nobody to ask: a studio owner who takes their own class, or an artist holding
-- their class in a studio they own. Those rows are born CONFIRMED / ACCEPTED,
-- and the log the user asked for is two things the app already keeps: the row
-- itself stays on the Inbox's Requests desk wearing its answer (19 Sep: "the
-- asks that stay"), and a notification is raised where the fact happens (28 Aug
-- pattern). ⚠ Only where the row would otherwise have been an ASK: an artist's
-- class on their own artist page has seated its owner as teacher by construction
-- since 18 Sep and raises nothing, as before.
--
-- HOW: every body is read out of the catalog and edited by exact anchor inside a
-- DO block — never re-typed (the 20 Sep precedent, #0ah). Each anchor must occur
-- exactly once or the whole migration rolls back. `create or replace` keeps every
-- ACL, so anon's executable set cannot move; the dry run asserts it.
--
-- RLS impact: no policy added, dropped or altered. Seven function BODIES change;
-- no signature, no grant. Nothing existing is touched: no row moves, and every
-- studio an organization owns stays exactly where it is.

/* replace `p_from` with `p_to` in `p_def`, asserting it is there EXACTLY ONCE —
   dropped at the end of this file, like 16 Sep's `_dos_rename_text` */
create function public._dos_swap(p_def text, p_from text, p_to text, p_fn text, p_expect integer default 1) returns text
language plpgsql as $fn$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_from, ''))) / length(p_from);
  if v_n <> p_expect then
    raise exception 'anchor found % times in %, expected %: %', v_n, p_fn, p_expect, left(p_from, 80);
  end if;
  return replace(p_def, p_from, p_to);
end;
$fn$;

do $migration$
declare
  v_def text;
  v_new text;
begin
  -- ── 1. why_no_studio(): the role line goes; the cap stays and names an account ──
  select pg_get_functiondef('public.why_no_studio()'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  if v_role <> ''org'' then return ''Only an organization can set up a studio.''; end if;\n', '', 'why_no_studio()');
  v_new := public._dos_swap(v_new,
    '  -- the cap (18 Sep 2026): the live studios this organization owns',
    '  -- the cap (18 Sep 2026): the live studios this ACCOUNT owns — a person''s or an organization''s (26 Sep 2026)',
    'why_no_studio()');
  v_new := public._dos_swap(v_new,
    'return ''An organization runs at most 15 studios on DanceOS — this one already has '' || v_studios || ''.'';',
    'return ''One account runs at most 15 studios on DanceOS — this one already has '' || v_studios || ''.'';',
    'why_no_studio()');
  execute v_new;

  -- ── 2. subscribe: the studio branch asks "is it yours", not "are you an organization" ──
  select pg_get_functiondef('public.subscribe(text, uuid)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'    if v_role <> ''org'' then raise exception ''only an organization subscribes a studio''; end if;\n', '', 'subscribe');
  execute v_new;

  -- ── 3. ask_class_person: the owner naming THEMSELVES is not an ask ──
  select pg_get_functiondef('public.ask_class_person(uuid, uuid, text, boolean, boolean, integer)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    'values (p_class_id, v_class.business_id, p_user_id, p_kind, ''asked'',',
    E'values (p_class_id, v_class.business_id, p_user_id, p_kind,\n          -- 26 Sep 2026: the owner naming THEMSELVES has nobody to ask — born confirmed\n          case when p_user_id = v_user and v_owner then ''confirmed'' else ''asked'' end,',
    'ask_class_person');
  execute v_new;

  -- ── 4. create_class_with_session: an artist's class in a studio THEY OWN needs no request ──
  select pg_get_functiondef('public.create_class_with_session(uuid, text, text, text, text, integer, integer, text, timestamptz, timestamptz, uuid, text, uuid, double precision, double precision, text)'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'    if p_status <> ''draft'' then\n      raise exception ''a class at a studio is saved as a draft until the studio accepts the room'';',
    E'    -- 26 Sep 2026: your own studio''s room is yours without asking, so it may publish from the form\n    if p_status <> ''draft'' and not public.is_business_owner(p_venue_business_id) then\n      raise exception ''a class at a studio is saved as a draft until the studio accepts the room'';',
    'create_class_with_session');
  v_new := public._dos_swap(v_new,
    'p_venue_business_id, case when p_venue_business_id is null then null else ''requested'' end,',
    E'p_venue_business_id,\n          -- 26 Sep 2026: a room in a studio the caller OWNS is accepted at birth\n          case when p_venue_business_id is null then null\n               when public.is_business_owner(p_venue_business_id) then ''accepted''\n               else ''requested'' end,',
    'create_class_with_session');
  execute v_new;

  -- ── 5. classes_venue_changes: moving a class INTO your own studio is not a new ask either ──
  select pg_get_functiondef('public.classes_venue_changes()'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    'new.venue_status := case when new.venue_business_id is null then null else ''requested'' end;',
    E'new.venue_status := case when new.venue_business_id is null then null\n                             when public.is_business_owner(new.venue_business_id) then ''accepted'' -- 26 Sep 2026: your own room\n                             else ''requested'' end;',
    'classes_venue_changes');
  execute v_new;

  -- ── 6. the LOG: a self-seated teacher is told, where an ask would have been ──
  select pg_get_functiondef('public.notify_class_person()'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  if tg_op = ''INSERT'' and new.status = ''asked'' then',
    E'  -- 26 Sep 2026: the owner took their OWN class at their OWN studio — no ask went out,\n'
    || E'  -- so this is the line in the Inbox that says so (an artist page''s own class raises nothing, as before)\n'
    || E'  if tg_op = ''INSERT'' and new.status = ''confirmed'' and new.user_id = new.created_by\n'
    || E'     and exists (select 1 from public.businesses b where b.id = new.business_id and b.type = ''studio'') then\n'
    || E'    perform public.notify(new.user_id, ''people'',\n'
    || E'      ''You take '' || coalesce(v_class.title, ''a class'') || '' at '' || coalesce(v_business, ''your studio''),\n'
    || E'      ''Your own studio, your own class — no confirmation needed. Publish it from the register.'',\n'
    || E'      ''/c/'' || coalesce(v_class.share_slug, ''''));\n'
    || E'  elsif tg_op = ''INSERT'' and new.status = ''asked'' then',
    'notify_class_person');
  execute v_new;

  -- ── 7. the LOG: a room taken in your own studio is told too ──
  select pg_get_functiondef('public.notify_venue_request()'::regprocedure) into v_def;
  v_new := public._dos_swap(v_def,
    E'  if (tg_op = ''INSERT'' and new.venue_status = ''requested'')',
    E'  -- 26 Sep 2026: an artist holding a class in a studio THEY OWN — accepted at birth, no request\n'
    || E'  if (tg_op = ''INSERT'' and new.venue_status = ''accepted'')\n'
    || E'     or (tg_op = ''UPDATE'' and new.venue_status = ''accepted''\n'
    || E'         and old.venue_status is distinct from ''accepted'' and old.venue_status is distinct from ''requested'') then\n'
    || E'    for v_owner in\n'
    || E'      select m.user_id from public.business_members m\n'
    || E'       where m.business_id = new.business_id and m.member_role = ''owner'' and m.deleted_at is null\n'
    || E'    loop\n'
    || E'      perform public.notify(v_owner, ''classes'',\n'
    || E'        v_label || '' is held in '' || coalesce(new.room, ''a room'') || '' at '' || coalesce(v_venue, ''your studio''),\n'
    || E'        ''Your own studio — the room is yours without asking. Publish it from Your classes.'',\n'
    || E'        ''/my-classes?show=manage'');\n'
    || E'    end loop;\n'
    || E'  elsif (tg_op = ''INSERT'' and new.venue_status = ''requested'')',
    'notify_venue_request');
  -- ⚠ A PRE-EXISTING BUG, FOUND BY THIS MIGRATION'S OWN DRY RUN: both of the
  -- 18 Sep branches wrote the kind 'classes', and `notifications.kind`'s CHECK
  -- admits 'class' (the six kinds of 28 Aug). `notify()` swallows every error by
  -- design — a notification must never fail the fact — so not one venue-request
  -- notification has ever landed: the studio being asked for its room was never
  -- told, and neither was the artist when it answered. The Inbox row itself was
  -- always there, which is why nobody noticed. Three occurrences now (the two of
  -- 18 Sep and the one above); all three become the word the CHECK keeps.
  v_new := public._dos_swap(v_new, 'perform public.notify(v_owner, ''classes'',', 'perform public.notify(v_owner, ''class'',', 'notify_venue_request', 3);
  execute v_new;
end
$migration$;

drop function public._dos_swap(text, text, text, text, integer);

comment on function public.why_no_studio() is
  'Why the signed-in account may not open a studio right now — null when it may. Any account (26 Sep 2026: a user, an artist or an organization); at most 15 studios. Printed by the hub and raised by create_business_with_owner.';
comment on function public.subscribe(text, uuid) is
  'The OWNER subscribes a studio — a person''s or an organization''s since 26 Sep 2026 — once DanceOS has verified it; the Artist plan is a person''s. The authorisation pays the first period.';
comment on function public.ask_class_person(uuid, uuid, text, boolean, boolean, integer) is
  'The studio''s owner asks anyone on DanceOS to TAKE a class; the owner or that person asks an ASSISTANT (18 Sep 2026). Asking again is a fresh ask. The owner naming THEMSELVES is born confirmed (26 Sep 2026) — there is nobody to ask, and the Inbox keeps the line.';

-- Notifications by app area, settings per area, and team invites that are told
-- (11 Oct 2026).
--
-- The user: "fix notifications completely revamp it according to new needs
-- with notification history and settings managed properly", choosing: groups by
-- APP AREA, New · Earlier with chips, settings per group (in-app + phone push),
-- and old notifications re-pointed and regrouped. And: "artist team invites not
-- reaching the person" — measured: business_invites has NO notify trigger, so a
-- team invite told nobody (Jishnu Nanda's invite of 15:25 today, no row).
--
-- What changes, and nothing else:
--   1. notification_group(kind, href) — ONE rule: a notification's group is the
--      area it opens. A BEFORE INSERT trigger applies it to every row, so the
--      thirty-odd functions that raise notifications keep writing what they
--      write ('people', 'booking', …) and land in the right group.
--      Groups: class · team · crew · enquiry · money · danceos (+ 'event', kept
--      only for the retired feature's old rows).
--   2. The stored rows: links into the retired Inbox desks re-pointed (class
--      asks → /my-classes?tab=todo, crew asks → /crews?show=in), every row
--      regrouped by the same rule, old Event rows marked read (history).
--      Titles and bodies untouched; nothing deleted.
--   3. notifications_kind_check narrowed to the groups.
--   4. notification_prefs.push_kinds (per-group push switch); kinds becomes the
--      per-group "show here" switch, its keys carried over. set_notification_prefs
--      takes p_push_kinds LAST (dropped and re-created — no overload); push_dispatch
--      reads push_kinds; my_unread_notifications leaves out a group switched off.
--   5. A team invite is TOLD: the person invited (by id, or by the address they
--      sign in with), its answer to the business's owner and managers, and a
--      withdrawal to the person.
--   6. my_pending_invites / my_answered_invites carry who invited and the
--      business's picture (RETURNS TABLE changes → dropped and re-created, ACL
--      restated exactly: authenticated + service_role).
-- No table, no policy. No begin/commit (Rule 18).

-- ── 1 · the rule ──────────────────────────────────────────────────────────
create or replace function public.notification_group(p_kind text, p_href text)
 returns text
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  h text := coalesce(p_href, '');
begin
  if p_kind in ('team', 'crew', 'danceos') then return p_kind; end if;
  if p_kind = 'event' then return 'event'; end if;
  if h like '/admin%' or h like '/support%' then return 'danceos'; end if;
  if p_kind = 'money' then return 'money'; end if;
  if p_kind = 'enquiry' or h like '/inbox/enquiries%' then return 'enquiry'; end if;
  if h like '/crews%' or h like '/crew/%' or h like '/practice%' then return 'crew'; end if;
  if h like '/business?show=team%' or h ~ '^/business/[^/?]+/staff' or h like '/join/%' then return 'team'; end if;
  if p_kind in ('class', 'booking')
     or h like '/my-classes%' or h like '/c/%' or h like '/calendar%'
     or h ~ '^/business/[^/?]+/(classes|calendar|refunds)' then
    return 'class';
  end if;
  return 'danceos';
end;
$function$;
revoke all on function public.notification_group(text, text) from public, anon, authenticated;

create or replace function public.notifications_set_group()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.kind := public.notification_group(new.kind, new.href);
  return new;
end;
$function$;
revoke all on function public.notifications_set_group() from public, anon, authenticated;

drop trigger if exists notifications_set_group on public.notifications;
create trigger notifications_set_group
  before insert on public.notifications
  for each row execute function public.notifications_set_group();

-- ── 2 · the stored rows ───────────────────────────────────────────────────
alter table public.notifications drop constraint notifications_kind_check;

-- a class ask opened the Inbox's Requests desk, gone since this morning
update public.notifications set href = '/my-classes?tab=todo'
 where href = '/inbox' and deleted_at is null
   and kind in ('people', 'class')
   and (title like '% wants you as %' or title like '% asks to hold %');
-- a crew ask opened the Inbox's Invites desk
update public.notifications set href = '/crews?show=in'
 where href = '/inbox' and deleted_at is null and title like '% wants you on the roster%';
-- an organization's team ask (the feature is retired): history, in the team area
update public.notifications set href = '/business?show=team', read_at = coalesce(read_at, now())
 where href = '/inbox' and deleted_at is null and title like '% wants you on its team as %';

-- every row into its group (deleted ones too, so the CHECK holds for all)
update public.notifications set kind = public.notification_group(kind, href)
 where kind is distinct from public.notification_group(kind, href);

-- the retired Events feature: kept as history, nothing left to act on
update public.notifications set read_at = coalesce(read_at, now())
 where kind = 'event' and read_at is null and deleted_at is null;

alter table public.notifications add constraint notifications_kind_check
  check (kind in ('class', 'team', 'crew', 'enquiry', 'money', 'danceos', 'event'));

-- ── 4 · settings per group ────────────────────────────────────────────────
alter table public.notification_prefs add column if not exists push_kinds jsonb not null default '{}'::jsonb;

-- the old six keys become the groups they fed ('people' fed both team and crew)
update public.notification_prefs set kinds = jsonb_strip_nulls(jsonb_build_object(
    'class', coalesce(kinds -> 'class', kinds -> 'booking'),
    'team', kinds -> 'people',
    'crew', kinds -> 'people',
    'enquiry', kinds -> 'enquiry',
    'money', kinds -> 'money'));

drop function public.set_notification_prefs(jsonb, boolean, boolean, boolean);
create function public.set_notification_prefs(
  p_kinds jsonb,
  p_push boolean,
  p_whatsapp boolean,
  p_email boolean,
  p_push_kinds jsonb default null)
 returns public.notification_prefs
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_row public.notification_prefs;
  v_key text;
  v_map jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  -- only the six groups, only booleans: a preference this app cannot act on is
  -- not a preference it should store
  foreach v_map in array array[p_kinds, p_push_kinds] loop
    if v_map is not null then
      for v_key in select jsonb_object_keys(v_map) loop
        if v_key not in ('class', 'team', 'crew', 'enquiry', 'money', 'danceos') then
          raise exception 'unknown notification group: %', v_key;
        end if;
        if jsonb_typeof(v_map -> v_key) <> 'boolean' then
          raise exception 'a switch is on or off';
        end if;
      end loop;
    end if;
  end loop;

  perform public.my_notification_prefs();
  update public.notification_prefs set
    kinds = coalesce(p_kinds, kinds),
    push_kinds = coalesce(p_push_kinds, push_kinds),
    push = coalesce(p_push, push),
    whatsapp = coalesce(p_whatsapp, whatsapp),
    email = coalesce(p_email, email),
    updated_by = v_user
  where user_id = v_user
  returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.set_notification_prefs(jsonb, boolean, boolean, boolean, jsonb) from public, anon;
grant execute on function public.set_notification_prefs(jsonb, boolean, boolean, boolean, jsonb) to authenticated, service_role;

create or replace function public.push_dispatch()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_url text;
  v_secret text;
  v_push boolean;
  v_kind_on boolean;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id and s.deleted_at is null) then
    return null;
  end if;
  -- the phone hears a group while push is on for this person AND for the group
  -- (11 Oct 2026: per-group push, `push_kinds`)
  select coalesce(p.push, true), coalesce((p.push_kinds ->> new.kind)::boolean, true)
    into v_push, v_kind_on
    from public.notification_prefs p where p.user_id = new.user_id and p.deleted_at is null;
  if coalesce(v_push, true) = false or coalesce(v_kind_on, true) = false then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 8000
  );
  return null;
exception when others then
  -- a notification must never be the reason the fact it reports fails
  return null;
end;
$function$;

create or replace function public.my_unread_notifications()
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- a group switched off "here" is not counted on the bell
  select count(*)::integer
    from public.notifications n
    left join public.notification_prefs p on p.user_id = n.user_id and p.deleted_at is null
   where n.user_id = auth.uid() and n.deleted_at is null and n.read_at is null
     and coalesce((p.kinds ->> n.kind)::boolean, true);
$function$;

-- ── 5 · a team invite is told ─────────────────────────────────────────────
create or replace function public.member_role_word(p_role text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_role
    when 'owner' then 'Owner'
    when 'manager' then 'Manager'
    when 'trainer' then 'Faculty'
    when 'visiting_faculty' then 'Visiting faculty'
    when 'assistant' then 'Assistant'
    else 'Other team member' end;
$function$;
revoke all on function public.member_role_word(text) from public, anon;
grant execute on function public.member_role_word(text) to authenticated, service_role;

create or replace function public.notify_business_invite()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_biz public.businesses;
  v_target uuid;
  v_who text;
begin
  select * into v_biz from public.businesses b where b.id = new.business_id;
  v_target := new.user_id;
  if v_target is null and new.email is not null then
    select u.id into v_target from auth.users u where lower(u.email) = lower(new.email) limit 1;
  end if;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify(v_target, 'team',
      coalesce(v_biz.name, 'A studio') || ' wants you on its team',
      'As ' || public.member_role_word(new.member_role) || ' — answer it in your Team section.',
      '/business?show=team');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'declined') then
    select p.full_name into v_who from public.profiles p where p.id = coalesce(new.accepted_by, v_target);
    perform public.notify_business_runners(new.business_id, 'team',
      coalesce(v_who, new.name, 'Somebody')
        || case new.status when 'accepted' then ' joined ' else ' said no to ' end
        || coalesce(v_biz.name, 'your team'),
      case new.status when 'accepted' then 'As ' || public.member_role_word(new.member_role) else null end,
      '/business/' || new.business_id::text || '/staff');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'revoked' then
    perform public.notify(v_target, 'team',
      coalesce(v_biz.name, 'A studio') || ' withdrew its invitation',
      null, '/business?show=team');
  end if;
  return null;
exception when others then
  return null;
end;
$function$;
revoke all on function public.notify_business_invite() from public, anon, authenticated;

drop trigger if exists business_invites_notify on public.business_invites;
create trigger business_invites_notify
  after insert or update of status on public.business_invites
  for each row execute function public.notify_business_invite();

-- ── 6 · who invited, and the business's face ──────────────────────────────
-- An artist's team is the ARTIST: its face is their own profile picture (the
-- user, 11 Oct 2026: "artist team invite to carry their profile photo").
create or replace function public.business_face_path(p_business_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case when b.type = 'artist_page' then
           coalesce((select p.profile_photo_path
                       from public.business_members m
                       join public.profiles p on p.id = m.user_id
                      where m.business_id = b.id and m.member_role = 'owner' and m.deleted_at is null
                      order by m.created_at asc limit 1), b.profile_photo_path)
         else b.profile_photo_path end
    from public.businesses b where b.id = p_business_id;
$function$;
revoke all on function public.business_face_path(uuid) from public, anon, authenticated;

drop function public.my_pending_invites();
create function public.my_pending_invites()
 returns table(invite_id uuid, business_id uuid, business_name text, business_type text, member_role text,
               code text, invited_name text, created_at timestamp with time zone,
               inviter_name text, business_photo_path text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select i.id, i.business_id, t.name, t.type, i.member_role, i.code, i.name, i.created_at,
         (select p.full_name from public.profiles p where p.id = i.created_by), public.business_face_path(t.id)
  from public.business_invites i
  join public.businesses t on t.id = i.business_id
  where (i.email = public.my_auth_email() or i.user_id = auth.uid())
    and i.status = 'pending'
    and i.deleted_at is null
    and t.deleted_at is null
  order by i.created_at desc
  limit 20;
$function$;
revoke all on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated, service_role;

drop function public.my_answered_invites();
create function public.my_answered_invites()
 returns table(invite_id uuid, business_id uuid, business_name text, member_role text, status text,
               created_at timestamp with time zone, answered_at timestamp with time zone,
               inviter_name text, business_photo_path text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select i.id, i.business_id, t.name, i.member_role, i.status, i.created_at, i.updated_at,
         (select p.full_name from public.profiles p where p.id = i.created_by), public.business_face_path(t.id)
    from public.business_invites i
    join public.businesses t on t.id = i.business_id
   where (i.email = public.my_auth_email() or i.user_id = auth.uid())
     and i.status in ('accepted', 'declined', 'revoked')
     and i.deleted_at is null
     and t.deleted_at is null
   order by i.updated_at desc
   limit 100
$function$;
revoke all on function public.my_answered_invites() from public, anon;
grant execute on function public.my_answered_invites() to authenticated, service_role;

comment on function public.notification_group(text, text)
  is 'A notification''s group is the area it opens (11 Oct 2026): class · team · crew · enquiry · money · danceos; event for the retired feature''s rows.';
comment on column public.notification_prefs.kinds
  is 'Per group: shown in the app (default on). Keys are notification_group values.';
comment on column public.notification_prefs.push_kinds
  is 'Per group: pushed to the phone (default on), while `push` is on.';

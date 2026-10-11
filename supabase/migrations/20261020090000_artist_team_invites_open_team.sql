-- ⚠ ARTIST TEAM INVITATIONS ARE ANSWERED ON THE TEAM PAGE (11 Oct 2026).
--
-- The user: "Team section to have two columns My Team … and Artist Teams which
-- manages team invites from artist which is currently being handled in studio
-- teams. for studio team invites in studio. artist team invites in teams."
--
-- The app splits the invitations by the kind of business that sent them: a
-- STUDIO's stays at the top of the Studios hub's Team column, an ARTIST's goes
-- to the Team page's Artist Teams column (`/team`, which sends an artist to
-- their own Team desk). Two things in the database have to follow:
--
--   1 · `my_answered_invites` hands back the business's TYPE, so an answered
--       invitation can be filed under the right one (`my_pending_invites` has
--       carried it since 20261019090000). A RETURNS TABLE change, so the
--       function is dropped and re-created and its grants restated exactly
--       (authenticated + service_role; never anon).
--   2 · `notify_business_invite` points an artist page's invitation — and its
--       withdrawal — at `/team`, and names it "An artist" when the page has no
--       name. A studio's still opens `/business?show=team`. The body is the live
--       catalog's own with those two lines changed.
--   3 · `notification_group` files `/team` under the team area, so a write to
--       that address from any kind lands in Team on the notifications screen.
--
-- Nothing else moves: no table, column, row, policy or grant beyond the one
-- function's restated set. Stored notifications keep their address — an old
-- `/business?show=team` link still lands on the Studios hub, whose Team column
-- points at the Team page while an artist's invitation waits.

drop function if exists public.my_answered_invites();

create function public.my_answered_invites()
 returns table(invite_id uuid, business_id uuid, business_name text, member_role text, status text, created_at timestamp with time zone, answered_at timestamp with time zone, inviter_name text, business_photo_path text, business_type text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select i.id, i.business_id, t.name, i.member_role, i.status, i.created_at, i.updated_at,
         (select p.full_name from public.profiles p where p.id = i.created_by), public.business_face_path(t.id),
         t.type
    from public.business_invites i
    join public.businesses t on t.id = i.business_id
   where (i.email = public.my_auth_email() or i.user_id = auth.uid())
     and i.status in ('accepted', 'declined', 'revoked')
     and i.deleted_at is null
     and t.deleted_at is null
   order by i.updated_at desc
   limit 100
$function$;

revoke all on function public.my_answered_invites() from public, anon, authenticated, service_role;
grant execute on function public.my_answered_invites() to authenticated, service_role;

comment on function public.my_answered_invites() is
  'The team invitations the caller has answered (or that were withdrawn) — the Answered sheets on the Studios hub (a studio''s) and the Team page (an artist''s, by business_type).';

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
  v_here text;
  v_word text;
begin
  select * into v_biz from public.businesses b where b.id = new.business_id;
  v_target := new.user_id;
  if v_target is null and new.email is not null then
    select u.id into v_target from auth.users u where lower(u.email) = lower(new.email) limit 1;
  end if;
  /* an artist's invitation is answered on the Team page, a studio's on the Studios hub */
  v_here := case when v_biz.type = 'artist_page' then '/team' else '/business?show=team' end;
  v_word := case when v_biz.type = 'artist_page' then 'An artist' else 'A studio' end;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify(v_target, 'team',
      coalesce(v_biz.name, v_word) || ' wants you on its team',
      'As ' || public.member_role_word(new.member_role) || ' — answer it in your Team section.',
      v_here);
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
      coalesce(v_biz.name, v_word) || ' withdrew its invitation',
      null, v_here);
  end if;
  return null;
exception when others then
  return null;
end;
$function$;

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
  if h like '/business?show=team%' or h ~ '^/business/[^/?]+/staff' or h like '/join/%' or h = '/team' or h like '/team?%' then return 'team'; end if;
  if p_kind in ('class', 'booking')
     or h like '/my-classes%' or h like '/c/%' or h like '/calendar%'
     or h ~ '^/business/[^/?]+/(classes|calendar|refunds)' then
    return 'class';
  end if;
  return 'danceos';
end;
$function$;

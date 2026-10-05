-- A PERSON CAN ASK TO LEAVE (6 Oct 2026, decision 6 of the eight put to the
-- user on 5 Oct, "resolve all as you mentioned apart from point 5"). DPDP: a
-- person must be able to ask for their account to be erased from inside the app.
--
-- What it is, and what it deliberately is not:
--   * ONE DOOR, `request_account_deletion(p_reason)`, the caller's own and
--     nobody else's (there is no p_user_id). It refuses, in words, while the
--     person still holds something other people depend on:
--       - they are the ONLY owner of a live studio (hand it over or ask DanceOS
--         to close it — a studio with nobody behind it strands its students);
--       - they LEAD a live crew (hand it to a member first);
--       - a subscription they pay still RENEWS (stop renewing it first — a
--         mandate is Cashfree's, and deleting a row stops no charge);
--       - they hold a live seat on a class still to run (cancel it first — the
--         refund rules are the cancel's, not this door's);
--       - they are the confirmed ARTIST on a published class still to run (the
--         studio must put somebody else on it — a class with nobody teaching it
--         is a broken promise to everybody booked);
--       - their own artist page still has a published class still to run.
--   * Otherwise, in one transaction: a support thread is opened in their name
--     carrying their name, address and reason (so DanceOS can find the account
--     after the profile is gone); every live team seat, crew seat and class ask
--     or seat is closed (soft, `deleted_at` — so a session already taught keeps
--     its credit, 20260918170000); their own artist page is closed; and the
--     PROFILE is soft-deleted. The admins are told.
--   * ⚠ NOTHING IS HARD-DELETED HERE. The auth account is the platform's to
--     erase (the admin API), after a person has read the thread — the same rule
--     as every other irreversible act in this repo. The app bans sign-in on the
--     auth account straight after this door answers, so a soft-deleted person
--     cannot sign in and meet onboarding (which would collide with their own
--     row). Putting a person back is one UPDATE and an unban.
--   * `support_thread_list` is INVOKER and inner-joined `profiles`, whose RLS
--     hides a deleted row — so the admin would never have SEEN the request. It
--     is now a LEFT join with the name defaulting to "Deleted account"; the
--     body of the thread carries the name and address.
--
-- No table, no column, no policy; one new function (authenticated only), one
-- `create or replace` of `support_thread_list` (same signature, same grants).
-- No `begin;`/`commit;` (Rule 18).

create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_email text;
  v_thread uuid;
  v_hit text;
  v_n integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_body text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select p.full_name into v_name from public.profiles p where p.id = v_user and p.deleted_at is null;
  if v_name is null then
    raise exception 'this account has no profile to delete';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'a reason is at most 1000 characters';
  end if;

  -- ── the refusals, each in words ─────────────────────────────────────────
  select b.name into v_hit
    from public.business_members m
    join public.businesses b on b.id = m.business_id and b.deleted_at is null and b.type = 'studio'
   where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
     and not exists (select 1 from public.business_members o
                      where o.business_id = m.business_id and o.member_role = 'owner'
                        and o.deleted_at is null and o.user_id <> v_user)
   limit 1;
  if v_hit is not null then
    raise exception 'You are the only owner of % — hand it to another owner, or ask DanceOS to close it, before deleting your account', v_hit;
  end if;

  select c.name into v_hit from public.crews c
   where c.leader_id = v_user and c.deleted_at is null limit 1;
  if v_hit is not null then
    raise exception 'You lead % — hand the crew to a member before deleting your account', v_hit;
  end if;

  select case when s.kind = 'artist' then 'Your Artist plan'
              else coalesce('The subscription for ' || b.name, 'A subscription you pay') end
    into v_hit
    from public.subscriptions s
    left join public.businesses b on b.id = s.business_id
   where s.user_id = v_user and s.deleted_at is null
     and s.status in ('active', 'past_due', 'pending_auth')
     and not s.granted and not s.cancel_at_period_end
   limit 1;
  if v_hit is not null then
    raise exception '% still renews — stop renewing it from Subscription before deleting your account', v_hit;
  end if;

  select count(*) into v_n
    from public.class_bookings e
    join public.class_sessions s on s.id = e.session_id
   where e.user_id = v_user and e.status = 'enrolled' and e.deleted_at is null
     and s.ends_at > now();
  if v_n > 0 then
    raise exception 'You still hold % on classes still to run — cancel them from Your classes before deleting your account',
      case when v_n = 1 then 'a seat' else v_n || ' seats' end;
  end if;

  select count(*) into v_n
    from public.class_people k
    join public.classes c on c.id = k.class_id and c.deleted_at is null and c.status = 'published'
   where k.user_id = v_user and k.kind = 'artist' and k.status = 'confirmed' and k.deleted_at is null
     and exists (select 1 from public.class_sessions s
                  where s.class_id = c.id and s.deleted_at is null and s.ends_at > now());
  if v_n > 0 then
    raise exception 'You are taking % still to run — ask the studio to put somebody else on %, or finish %, before deleting your account',
      case when v_n = 1 then 'a class' else v_n || ' classes' end,
      case when v_n = 1 then 'it' else 'them' end,
      case when v_n = 1 then 'it' else 'them' end;
  end if;

  select count(*) into v_n
    from public.business_members m
    join public.businesses b on b.id = m.business_id and b.deleted_at is null and b.type = 'artist_page'
    join public.classes c on c.business_id = b.id and c.deleted_at is null and c.status = 'published'
   where m.user_id = v_user and m.member_role = 'owner' and m.deleted_at is null
     and exists (select 1 from public.class_sessions s
                  where s.class_id = c.id and s.deleted_at is null and s.ends_at > now());
  if v_n > 0 then
    raise exception 'Your artist page still has % to run — delete or finish %, before deleting your account',
      case when v_n = 1 then 'a class' else v_n || ' classes' end,
      case when v_n = 1 then 'it' else 'them' end;
  end if;

  -- ── the record DanceOS keeps, written first ─────────────────────────────
  v_email := public.my_auth_email();
  v_body := 'Please delete my account.' || chr(10) || chr(10)
         || 'Name: ' || v_name || chr(10)
         || 'Email: ' || coalesce(v_email, '—') || chr(10)
         || 'Account: ' || v_user::text
         || case when v_reason is not null then chr(10) || chr(10) || 'Why: ' || v_reason else '' end;

  insert into public.support_threads (account_id, subject, kind, request_id, opened_by_admin, last_message_at, account_read_at, created_by, updated_by)
  values (v_user, 'Delete my account', 'general', null, false, now(), now(), v_user, v_user)
  returning id into v_thread;
  insert into public.support_messages (thread_id, author_id, from_admin, body, created_by, updated_by)
  values (v_thread, v_user, false, left(v_body, 4000), v_user, v_user);

  perform public.notify_platform_admins('people',
    v_name || ' asked to delete their account',
    'Their profile is closed and sign-in is off. Erasing the account is yours to do.',
    '/admin/support/' || v_thread::text);

  -- ── what they held, closed (soft — history keeps its credit) ────────────
  update public.businesses b set deleted_at = now()
   where b.deleted_at is null and b.type = 'artist_page'
     and exists (select 1 from public.business_members m
                  where m.business_id = b.id and m.user_id = v_user
                    and m.member_role = 'owner' and m.deleted_at is null);

  update public.business_members set deleted_at = now()
   where user_id = v_user and deleted_at is null;

  update public.class_people set deleted_at = now()
   where user_id = v_user and deleted_at is null;

  update public.crew_members set deleted_at = now()
   where user_id = v_user and deleted_at is null;

  update public.profiles set deleted_at = now() where id = v_user and deleted_at is null;

  return jsonb_build_object('status', 'requested', 'thread_id', v_thread);
end;
$function$;

revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated, service_role;

comment on function public.request_account_deletion(text) is
  'A person asks to leave: refused in words while they are the only owner of a live studio, lead a live crew, pay a renewing subscription, hold a seat on a class still to run, or are the confirmed artist on one; otherwise opens a "Delete my account" support thread carrying their name and address, closes every seat, ask and their own artist page, and soft-deletes the profile. Hard deletion of the auth account stays a platform admin''s act.';

-- the admin's support list keeps a thread whose account has gone
create or replace function public.support_thread_list()
 returns table(id uuid, account_id uuid, account_name text, account_role text, account_profile_photo_path text, subject text, kind text, status text, request_id uuid, last_message_at timestamp with time zone, last_body text, last_from_admin boolean, unread integer, messages integer, created_at timestamp with time zone)
 language sql
 stable
 set search_path to ''
as $function$
  select t.id, t.account_id, coalesce(p.full_name, 'Deleted account'), coalesce(p.role, 'user'), p.profile_photo_path,
         t.subject, t.kind, t.status, t.request_id, t.last_message_at,
         (select m.body from public.support_messages m
           where m.thread_id = t.id and m.deleted_at is null
           order by m.created_at desc limit 1),
         (select m.from_admin from public.support_messages m
           where m.thread_id = t.id and m.deleted_at is null
           order by m.created_at desc limit 1),
         (select count(*)::int from public.support_messages m
           where m.thread_id = t.id and m.deleted_at is null
             and m.from_admin <> (t.account_id <> auth.uid())
             and m.created_at > coalesce(
                   case when t.account_id = auth.uid() then t.account_read_at else t.admin_read_at end,
                   '-infinity'::timestamptz)),
         (select count(*)::int from public.support_messages m where m.thread_id = t.id and m.deleted_at is null),
         t.created_at
  from public.support_threads t
  left join public.profiles p on p.id = t.account_id
  where t.deleted_at is null
  order by (t.status = 'open') desc, t.last_message_at desc;
$function$;

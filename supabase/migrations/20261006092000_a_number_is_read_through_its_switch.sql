-- ⚠⚠ Rule 9 (RLS / grants). 6 Oct 2026, the user's decision 4: a person's phone
-- number is readable only where its Call switch, or a real relationship, says so.
--
-- Until today the switch governed every PAGE and every STRANGER (`public_artist`
-- hands anon the number only while `phone_public` is on), but Step 1's row
-- policy lets any SIGNED-IN account read every live profile row — so anybody
-- with a token could read anybody's number straight off `profiles` through the
-- raw API, Call switch or not. RLS cannot hide one column; a column GRANT can.
--
-- THE WHOLE OF IT:
--   1. `profiles`: the table-level SELECT grant to `anon` and `authenticated` is
--      replaced by a COLUMN grant on every column EXCEPT `phone`. Row policies are
--      untouched (anon still has none, so it still reads no rows). INSERT, UPDATE
--      and every other grant are untouched — `update_my_profile` (definer) is
--      still the door that writes the number. ⚠ A FUTURE COLUMN on `profiles` must
--      be granted explicitly or no client can select it, and `select=*` on
--      `profiles` is now refused for a client (no app read uses it).
--   2. `profile_phones(uuid[])` — definer, signed-in only: the number of each id
--      the caller may see — their OWN; anybody's who switched Call on
--      (`phone_public`); a platform admin's view; and the owner or manager of a
--      business seeing a person who is ITS STUDENT (a class booking, a membership
--      pass or a lead naming them there). Nobody else's, ever.
--   3. `find_people_by_phone(text)` — definer, signed-in only: the people picker's
--      "type a mobile number" (19 Sep 2026). It matched any substring of three
--      digits, which let a number be fished out digit by digit; it now matches a
--      WHOLE number (the last ten digits) and hands back ids, never the number.
--
-- Nothing is backfilled; no row, policy, or function body changes. No
-- `begin;`/`commit;` (Rule 18).

revoke select on public.profiles from anon, authenticated;
grant select (
  id, full_name, role, city, created_at, updated_at, created_by, updated_by, deleted_at,
  profile_photo_path, age, socials, styles, member_no, verified_at,
  suspended_at, suspended_reason, gstin, gstin_verified_at, contact_email, phone_public,
  lat, lng, location_set_at, dob, layout, inbox_off
) on public.profiles to anon, authenticated;

comment on column public.profiles.phone is
  'A person''s number. NOT selectable by any client role since 6 Oct 2026 (decision 4): read through profile_phones(uuid[]), which honours the Call switch (phone_public), and written through update_my_profile.';

create function public.profile_phones(p_ids uuid[])
returns table (id uuid, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.phone
    from public.profiles p
   where p.id = any (p_ids[1:400])
     and p.deleted_at is null
     and p.phone is not null
     and (select auth.uid()) is not null
     and (
       p.id = (select auth.uid())
       or p.phone_public
       or public.is_platform_admin()
       or exists (
         select 1 from public.business_members me
          where me.user_id = (select auth.uid())
            and me.member_role in ('owner', 'manager')
            and me.deleted_at is null
            and (
              exists (select 1 from public.class_bookings b
                       where b.business_id = me.business_id and b.user_id = p.id and b.deleted_at is null)
              or exists (select 1 from public.membership_passes mp
                          where mp.business_id = me.business_id and mp.user_id = p.id and mp.deleted_at is null)
              or exists (select 1 from public.leads l
                          where l.business_id = me.business_id and l.user_id = p.id and l.deleted_at is null)
            )
       )
     );
$$;

revoke all on function public.profile_phones(uuid[]) from public, anon;
grant execute on function public.profile_phones(uuid[]) to authenticated;

comment on function public.profile_phones(uuid[]) is
  'The phone numbers the caller may read (6 Oct 2026, decision 4): their own, anybody''s with Call switched on, an admin''s view, and a business runner''s view of its own students. Ids in, (id, phone) out; nobody else''s number.';

create function public.find_people_by_phone(p_number text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.profiles p
   where (select auth.uid()) is not null
     and char_length(regexp_replace(coalesce(p_number, ''), '\D', '', 'g')) >= 10
     and p.deleted_at is null
     and p.role <> 'org'
     and p.phone is not null
     and right(regexp_replace(p.phone, '\D', '', 'g'), 10)
         = right(regexp_replace(p_number, '\D', '', 'g'), 10)
   limit 5;
$$;

revoke all on function public.find_people_by_phone(text) from public, anon;
grant execute on function public.find_people_by_phone(text) to authenticated;

comment on function public.find_people_by_phone(text) is
  'The people picker''s number search (6 Oct 2026, decision 4): a WHOLE mobile number (its last ten digits) finds the people who hold it, as ids — the number itself is never returned, and a fragment finds nobody.';

-- A FOLLOW LIST IS AS READABLE AS ITS COUNT (2 Oct 2026, the user: "accurate
-- follower following list on all profiles").
--
-- ⚠ Rule 9 — this WIDENS what a signed-in reader may see.
--
-- Step 15 (28 Aug 2026) made the rule "the count is public, the list is not":
-- `follows` has no SELECT policy for anybody but the two ends of a row, so on
-- somebody ELSE's profile the Followers figure printed a number and opened onto
-- "Nobody here you can see" — a list that disagreed with the count printed above
-- it, which is the exact complaint this app has fixed twice in its own numbers
-- (29 Sep 2026, C85). The user's answer is that the list is what the count is
-- OF, and every social app shows it to a signed-in reader.
--
-- So: two SECURITY DEFINER reads, signed-in only, that hand back exactly the
-- rows the three count functions of `20260929110000` count — and nothing about
-- the follow beyond who and what:
--
--   profile_followers(kind, id)  who follows a business, a person or a crew
--   profile_following(user_id)   what a person follows
--
-- ⚠ THE SAME FILTERS AS THE COUNTS, so the list and the number cannot disagree:
--   a follower is a LIVE profile; a followed business, person or crew is LIVE.
-- ⚠ NOT ANON. A stranger still reads the count and no list — `profiles` itself
--   has been signed-in-only since Step 1, and this does not move that line.
-- ⚠ NO TABLE, POLICY, GRANT ON AN EXISTING OBJECT OR ROW CHANGES. The table keeps
--   its two own-row policies; the only way to the list is these two functions.
-- ⚠ No begin/commit (Rule 18).

create or replace function public.profile_followers(p_kind text, p_id uuid)
returns table(user_id uuid, full_name text, profile_photo_path text, city text, followed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to see who follows this';
  end if;
  if p_kind not in ('business', 'person', 'crew') then
    raise exception 'a follow list is a business''s, a person''s or a crew''s';
  end if;
  return query
    select p.id, p.full_name, p.profile_photo_path, p.city, f.created_at
    from public.follows f
    join public.profiles p on p.id = f.follower_id and p.deleted_at is null
    where f.deleted_at is null
      and (
        (p_kind = 'business' and f.business_id = p_id)
        or (p_kind = 'person' and f.followee_id = p_id)
        or (p_kind = 'crew' and f.crew_id = p_id)
      )
    order by f.created_at desc
    limit 500;
end;
$$;

create or replace function public.profile_following(p_user_id uuid)
returns table(kind text, id uuid, name text, photo_path text, city text, business_type text, followed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to see who this follows';
  end if;
  return query
    select * from (
      select 'person'::text, fe.id, fe.full_name, fe.profile_photo_path, fe.city, null::text, f.created_at
      from public.follows f
      join public.profiles fe on fe.id = f.followee_id and fe.deleted_at is null
      where f.follower_id = p_user_id and f.deleted_at is null
      union all
      select 'business'::text, b.id, b.name, b.profile_photo_path, b.city, b.type, f.created_at
      from public.follows f
      join public.businesses b on b.id = f.business_id and b.deleted_at is null
      where f.follower_id = p_user_id and f.deleted_at is null
      union all
      select 'crew'::text, c.id, c.name, c.photo, c.city, null::text, f.created_at
      from public.follows f
      join public.crews c on c.id = f.crew_id and c.deleted_at is null
      where f.follower_id = p_user_id and f.deleted_at is null
    ) x
    order by 7 desc
    limit 500;
end;
$$;

revoke all on function public.profile_followers(text, uuid) from public, anon;
revoke all on function public.profile_following(uuid) from public, anon;
grant execute on function public.profile_followers(text, uuid) to authenticated, service_role;
grant execute on function public.profile_following(uuid) to authenticated, service_role;

comment on function public.profile_followers(text, uuid) is
  'Who follows a business, a person or a crew — signed-in only, the same rows follower_counts / person_follower_counts / crew_follower_counts count (2 Oct 2026).';
comment on function public.profile_following(uuid) is
  'What a person follows — signed-in only, the same rows person_follower_counts counts as following (2 Oct 2026).';

-- AN ARTIST HAS A TEAM, AND THEIR PAGE SAYS SO (27 Sep 2026)
--
-- ⚠ Rule 9 (RLS): this widens what a STRANGER may read by one thing, named
-- below and nothing else.
--
-- THE GAP. `person_associations` has listed an ARTIST PAGE among the places a
-- person holds a seat since 20 Sep ("Artists associated with"), so one
-- direction has always worked: a teacher's own profile names the artist they
-- work with. The other has not. `public_studio_team` — the one definer read
-- behind every public team list — ends with `b.type = 'studio'`, so an artist
-- page's faculty and assistants are readable by nobody, and an artist's public
-- face names nobody at all while every person on it names them.
--
-- An artist page takes the same seats a studio does (`rolesFor` offers Faculty
-- and Assistant, and `business_members` is one table), the people on it said
-- yes the same way, and the page is `listed` or it is not public at all. So the
-- rule is the same rule and the type test was the only thing in the way.
--
-- ⚠ WHAT WIDENS FOR A STRANGER: the confirmed seats on a LISTED artist page —
-- name, picture, seat — exactly the shape a listed studio's team has been since
-- 19 Sep, and no wider. An UNLISTED artist page (no live plan) still answers
-- nobody but its own members, because the `visibility = 'listed' or
-- is_business_member(...)` clause is untouched.
--
-- ⚠ `owner` STAYS IN THE SEAT LIST, though the artist's own page will not draw
-- it (the owner IS whose page it is, and naming them under their own name is
-- the thing this app calls a door to where you already are). Taking the word
-- out here would break a STUDIO's Owner group, which is the same read.
--
-- `create or replace`, same signature, same RETURNS TABLE, so the ACL cannot
-- move and no caller changes.

begin;

create or replace function public.public_studio_team(p_business_id uuid)
returns table (user_id uuid, member_role text, full_name text, photo_path text, is_org boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select m.user_id, m.member_role, p.full_name, p.profile_photo_path, (p.role = 'org') as is_org
  from public.business_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  join public.businesses b on b.id = m.business_id
  where m.business_id = p_business_id and m.deleted_at is null
    and m.member_role in ('owner', 'trainer', 'visiting_faculty', 'assistant')
    and b.deleted_at is null
    /* ⚠ AN ARTIST PAGE TOO (27 Sep 2026) — it takes the same seats, by the same
       consent, and is public only while listed, which the clause below keeps */
    and b.type in ('studio', 'artist_page')
    and (b.visibility = 'listed' or public.is_business_member(p_business_id))
  order by case m.member_role
             when 'owner' then 0 when 'trainer' then 1
             when 'visiting_faculty' then 2 else 3 end,
           m.sort, p.full_name;
$$;

comment on function public.public_studio_team(uuid) is
  'The confirmed seats a public business names: a LISTED studio''s or artist page''s, to anybody; one you belong to, to you. Name, picture and seat only — never an email, a number or a rate.';

commit;

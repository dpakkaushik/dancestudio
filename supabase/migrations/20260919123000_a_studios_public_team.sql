-- 19 Sep 2026: A STUDIO'S PUBLIC TEAM — its owner, its faculty, its visiting
-- faculty, as a stranger may read them. ⚠ RLS: widens what a stranger reads.
--
-- The user, on what a studio's page shows underneath: "Owner, Faculty,
-- Visiting Faculty." The page has printed FACULTY since Step 15, but off the
-- confirmed claims on published classes — the people teaching this week — and
-- for a stranger it printed nobody, because `profiles` is signed-in only. The
-- team is the TEAM: `business_members`, which is a private table. So one
-- SECURITY DEFINER read hands back, for a LISTED studio (or one the caller is a
-- member of), exactly three roles — owner, trainer, visiting_faculty — with a
-- name and a picture each, and whether the owner is an organization (so the
-- page can open /org/{id} for it). Staff are not part of it: nobody asked for
-- them and they are the desk's business, not the door's.

create or replace function public.public_studio_team(p_business_id uuid)
returns table(user_id uuid, member_role text, full_name text, photo_path text, is_org boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.member_role, p.full_name, p.profile_photo_path, (p.role = 'org') as is_org
  from public.business_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  join public.businesses b on b.id = m.business_id
  where m.business_id = p_business_id and m.deleted_at is null
    and m.member_role in ('owner', 'trainer', 'visiting_faculty')
    and b.deleted_at is null and b.type = 'studio'
    and (b.visibility = 'listed' or public.is_business_member(p_business_id))
  order by case m.member_role when 'owner' then 0 when 'trainer' then 1 else 2 end, p.full_name;
$$;
revoke execute on function public.public_studio_team(uuid) from public;
grant execute on function public.public_studio_team(uuid) to anon, authenticated, service_role;
comment on function public.public_studio_team(uuid) is
  'A listed studio''s owner, faculty (trainer) and visiting faculty, with names and pictures — what its public page prints under the buttons (19 Sep 2026). Empty for an unlisted studio unless the caller is on its team.';

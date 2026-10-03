-- ⚠ Rule 9: it WIDENS what a signed-out visitor reads. 3 Oct 2026, the user's
-- decision: a stranger "should see teachers face" on a class card.
--
-- Step 11 already publishes WHO teaches a published class of a listed business:
-- "anyone reads confirmed claims on public classes" admits anon to that row. What
-- a stranger could not read is the teacher's NAME and PICTURE, because `profiles`
-- has been signed-in only since Step 1 — so on a signed-out Discover every class
-- card fell back to the style square (18 Sep 2026, the backlog row that waited on
-- this decision).
--
-- One definer read, and it publishes NOTHING the policy does not already make
-- public except the two columns the card draws: the name and the picture of the
-- CONFIRMED artist of a PUBLISHED, live class of a LISTED, live business. An
-- asked-but-unanswered teacher, a draft, an unlisted studio's class and every
-- other profile column (age, account number, phone, city) stay as they were.
--
-- ⚠ No begin/commit (Rule 18): db push wraps the file already.

create or replace function public.public_class_teachers(p_class_ids uuid[])
returns table (class_id uuid, user_id uuid, full_name text, profile_photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (k.class_id) k.class_id, k.user_id, p.full_name, p.profile_photo_path
  from public.class_people k
  join public.classes c on c.id = k.class_id
  join public.businesses t on t.id = c.business_id
  join public.profiles p on p.id = k.user_id
  where k.class_id = any (coalesce(p_class_ids[1:500], '{}'::uuid[]))
    and k.kind = 'artist'
    and k.status = 'confirmed'
    and k.deleted_at is null
    and c.status = 'published'
    and c.deleted_at is null
    and t.visibility = 'listed'
    and t.deleted_at is null
    and p.deleted_at is null
  order by k.class_id, k.created_at;
$$;

comment on function public.public_class_teachers(uuid[]) is
  'The face on a class card for a reader who may not read profiles (3 Oct 2026): name + picture of the confirmed artist of a published class of a listed business — the claim row Step 11 already publishes, and nothing else of the profile. At most 500 classes a call.';

revoke all on function public.public_class_teachers(uuid[]) from public;
grant execute on function public.public_class_teachers(uuid[]) to anon, authenticated, service_role;

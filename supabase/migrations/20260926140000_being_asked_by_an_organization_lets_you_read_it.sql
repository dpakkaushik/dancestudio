-- BEING ASKED BY AN ORGANIZATION LETS YOU READ THE ASK (26 Sep 2026)
--
-- THE HOLE, found by the e2e (happy-path:2737) the night an organization
-- became a business: an organization names somebody as its owner from its Team
-- desk, and the person's Inbox row read "An organization wants to name you as
-- an owner of An organization". The ask row itself is theirs to read
-- (`organization_members`: the person reads their own), but the organization's
-- NAME now lives on a `businesses` row — since `20260926120000` an organization
-- is a business a person opens — and that row is UNLISTED for ever (its public
-- face is `org_is_public`, not `visibility`). Nobody but its owner and a
-- platform admin can read it, so the embed came back null and the row named
-- nobody. Until this morning the name was on the organization LOGIN's profile
-- row, which R12 let a wider set read.
--
-- THE FIX is the 18 Sep rule, one clause wider: `has_been_asked_by_business`
-- already lets a person with a live CLASS ask read the business that asked
-- (`20260918140000`, "being asked lets you read the ask"), and feeds the
-- SELECT policy "people asked onto a class read who asked" on `businesses`.
-- It now also answers true for a live `organization_members` row — asked,
-- confirmed or rejected, exactly the class rule's span — so the person an
-- organization names reads that organization's row for as long as the ask
-- lives, and not a moment longer: withdraw it (a soft delete) and the read
-- goes with it. SECURITY DEFINER stays, for the same reason as on 18 Sep — a
-- policy on `businesses` that read `organization_members` directly would
-- recurse through that table's own policies.
--
-- WHAT WIDENS: a person with a live organization_members row reads ONE
-- unlisted organization's `businesses` row — its name, city, picture, the GST
-- verified stamp, the columns every listed business already shows a stranger.
-- No policy is added or changed; no grant moves; anon's executable set is
-- unchanged (the helper was never anon's). Nothing existing is touched.
--
-- Same signature, so `create or replace` keeps the function's ACL; the grants
-- are restated anyway, the 16 Sep lesson.

create or replace function public.has_been_asked_by_business(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.class_people cp
     where cp.business_id = p_business_id
       and cp.user_id = auth.uid()
       and cp.deleted_at is null
  )
  or exists (
    -- 26 Sep 2026: named on an organization's public page — asked, confirmed or
    -- rejected — reads the organization that asked
    select 1 from public.organization_members m
     where m.org_id = p_business_id
       and m.user_id = auth.uid()
       and m.deleted_at is null
  );
$$;
comment on function public.has_been_asked_by_business(uuid) is
  'True while the caller has a live class ask from this business, or a live organization_members row on it (26 Sep 2026). Lets the person asked read WHO is asking, even when the business is not listed - a studio before its badge, an organization always.';
revoke execute on function public.has_been_asked_by_business(uuid) from public, anon;
grant execute on function public.has_been_asked_by_business(uuid) to authenticated;

-- Step 8 (Class detail + share links): every class gets a stable share slug, so a
-- booking link — danceos.in/c/{slug} in the prototype (shareRecOf, DanceOSApp.jsx:3974)
-- — resolves to the class detail page (/c/{slug} here).
--
-- The slug is stamped ONCE at insert (title-derived + random suffix) and never
-- regenerated: a link handed out must keep working after the class is renamed.
-- The unique index spans soft-deleted rows too, so a dead class's slug is never
-- handed to a new one.
--
-- RLS impact: NONE — no policy is added or changed. A slug lookup rides the
-- existing SELECT policies (public reads published classes of listed tenants;
-- members read their own drafts), so a draft's link 404s for strangers and
-- resolves for its own studio.

alter table public.classes
  add column share_slug text
  check (share_slug is null or (char_length(share_slug) between 6 and 40 and share_slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'));

comment on column public.classes.share_slug is
  'Stable public booking-link slug (/c/{slug}). Stamped at insert, never regenerated.';

-- Title → slug, prototype grammar (lowercase, runs of non-alphanumerics collapse
-- to "-", trimmed, capped at 26 chars — shareRecOf line 3975) + a 4-char random
-- suffix so two "Hip-Hop · Beginner" classes can never collide. SECURITY DEFINER:
-- the uniqueness probe must see every row (deleted included), not the caller's slice.
create or replace function public.generate_class_slug(p_title text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
begin
  v_base := left(
    regexp_replace(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'), '(^-+)|(-+$)', '', 'g'),
    26);
  v_base := regexp_replace(v_base, '-+$', '');  -- the 26-char cut can re-expose a trailing hyphen
  if v_base = '' then
    v_base := 'class';
  end if;
  loop
    v_slug := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    exit when not exists (select 1 from public.classes c where c.share_slug = v_slug);
  end loop;
  return v_slug;
end;
$$;

revoke execute on function public.generate_class_slug(text) from public, anon, authenticated;

-- Stamped by trigger rather than inside create_class_with_session, so every insert
-- path (the RPC, seed.sql) gets a slug without rewriting the applied RPC (Rule 4).
create or replace function public.classes_fill_share_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.share_slug is null then
    new.share_slug := public.generate_class_slug(new.title);
  end if;
  return new;
end;
$$;

revoke execute on function public.classes_fill_share_slug() from public, anon, authenticated;

create trigger classes_fill_share_slug
  before insert on public.classes
  for each row execute function public.classes_fill_share_slug();

-- Existing classes get their slugs now, then the column locks down.
update public.classes set share_slug = public.generate_class_slug(title) where share_slug is null;

alter table public.classes alter column share_slug set not null;

create unique index classes_share_slug_key on public.classes (share_slug);

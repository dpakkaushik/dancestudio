-- A GRID IS ARRANGED, AND THE ARRANGEMENT IS REMEMBERED (22 Sep 2026)
--
-- The user: *"all columns on such pages should be swapable so we can place them
-- in order of our choice"*, then, asked which columns: *"the reorder is required
-- for columns inside tools on home tab for all profiles"* — the TILES in the
-- Tools panel on Home, on every profile you are in. Asked where the order should
-- live, they had already said: **on the account, all devices**.
--
-- ⚠ THIS IS A PREFERENCE, NOT A FACT ABOUT ANYBODY. Nothing here is read by a
-- stranger, no public function is touched, and no policy changes: the Tools
-- panel is on YOUR OWN Home, so the order is the viewer's own and is stored on
-- the viewer's own profile row. A studio's grid is keyed by the studio's id, so
-- two people on one team each arrange that studio's tools for themselves — which
-- is right, because neither is looking at the other's screen.
--
-- ⚠ AND IT IS ONE COLUMN RATHER THAN A TABLE. A layout is at most a few dozen
-- short words per account; a table would be rows, a policy, an index and a join
-- on every Home render to answer a question the profile row is already being
-- read to answer. `profiles.socials` and `profiles.styles` set the precedent
-- here: an ordered list the person owns, kept on the person.
--
-- ⚠ NOTHING IS BACKFILLED AND NOTHING MOVES. An account with no layout gets
-- `{}` and every grid draws in the order the code has always drawn it, so this
-- migration changes what nobody sees until somebody arranges something.

-- 1 ── the column
alter table public.profiles
  add column if not exists layout jsonb not null default '{}'::jsonb;

comment on column public.profiles.layout is
  'This account''s own arrangement of the grids it looks at, keyed by grid: tools:user, tools:artist, tools:org, tools:studio:{business id}, tools:crew:{crew id}. A preference, never a fact about anybody — nothing public reads it (22 Sep 2026).';

-- 2 ── what may be stored in it
--
-- ⚠ THE CHECK IS THE REAL GUARD, NOT THE DOOR BELOW. Step 1's "users update own
-- profile" policy names no columns, so the owner of a row can PATCH this column
-- through PostgREST directly whatever the app does — which is the same thing the
-- 11 Sep audit found for every other column on this table, and is why the shape
-- is constrained by the DATABASE rather than by the function that writes it.
-- An object, at most 40 grids, each an array of at most 40 short strings, and
-- the whole column under 4 kB so nobody can keep a novel in it.
create or replace function public.is_a_layout(p jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(p) = 'object'
    and (select count(*) from jsonb_object_keys(p)) <= 40
    and not exists (
      select 1
      from jsonb_each(p) as e(k, v)
      where jsonb_typeof(v) <> 'array'
         or jsonb_array_length(v) > 40
         or k !~ '^[a-z][a-z0-9_:-]{0,79}$'
         or exists (
              select 1
              from jsonb_array_elements(v) as x
              where jsonb_typeof(x) <> 'string'
                 or char_length(x #>> '{}') not between 1 and 40
            )
    );
$$;

revoke execute on function public.is_a_layout(jsonb) from public, anon;
grant execute on function public.is_a_layout(jsonb) to authenticated, service_role;

-- ⚠ `length(layout::text)`, not `pg_column_size` — the second is STABLE rather
-- than immutable, and a CHECK is not the place to find that out. A jsonb cast to
-- text and its length are both immutable, and 4 kB of JSON is the same ceiling.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_layout_shape') then
    alter table public.profiles
      add constraint profiles_layout_shape
      check (public.is_a_layout(layout) and length(layout::text) <= 4000);
  end if;
end $$;

-- 3 ── the door
--
-- ⚠ ONE SMALL FUNCTION RATHER THAN A FIELD ON `update_my_profile`. That door
-- takes the WHOLE profile and would have to be dropped and re-created to gain an
-- argument — the pattern this file records as the one that loses an ACL — for a
-- preference that has nothing to do with a person's name or city.
--
-- ⚠ AND IT IS ATOMIC. Merging a key into the object in TypeScript would be a
-- read, a merge and a write, so two tabs arranging two different grids would
-- overwrite each other. `jsonb_set` does it in one statement, on the server.
--
-- ⚠ SCOPED TO `auth.uid()` INSIDE, with no p_user_id to aim at anybody else —
-- the rule every own-row door in this schema follows.
create or replace function public.set_my_layout(p_key text, p_order text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_:-]{0,79}$' then
    raise exception 'that is not a grid';
  end if;

  update public.profiles
     set layout = case
                    when p_order is null or array_length(p_order, 1) is null
                      then layout - p_key           -- arranging back to the default forgets the key
                    else jsonb_set(coalesce(layout, '{}'::jsonb), array[p_key], to_jsonb(p_order), true)
                  end
   where id = auth.uid()
     and deleted_at is null;
end;
$$;

revoke execute on function public.set_my_layout(text, text[]) from public, anon;
grant execute on function public.set_my_layout(text, text[]) to authenticated;

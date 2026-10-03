-- An asset can carry a PICTURE (3 Oct 2026, the user's "do small extras" — the
-- backlog row R45 left: the prototype's asset form has a photo, 16802-16810, and
-- 21 Sep shipped the three fields without one).
--
-- One column, one folder in the existing `media` bucket, three storage policies and
-- one door — the poster slice's exact shape (20260927130000), keyed on the BUSINESS
-- because an asset belongs to the business and outlives whoever photographed it.
-- ⚠ The owner's alone, like every other write on the assets desk: the folder's
-- policies and the door both ask `is_business_owner`, not membership.
-- ⚠ The `media` bucket is PUBLIC FOR READS, so a picture is readable by anybody
-- holding its exact URL. The path is random and no screen but the owner's desk ever
-- prints it — the same trade the posters and the header pictures already make.
--
-- ⚠ No begin/commit (Rule 18): db push wraps the file already.

alter table public.assets add column if not exists photo_path text;
comment on column public.assets.photo_path is
  'The asset''s picture, in media/assets/{business_id}/… (3 Oct 2026). Null = no picture.';

drop policy if exists "an owner writes their assets folder" on storage.objects;
create policy "an owner writes their assets folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'assets'
    and public.is_business_owner(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "an owner replaces their asset pictures" on storage.objects;
create policy "an owner replaces their asset pictures"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'assets'
    and public.is_business_owner(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "an owner deletes their asset pictures" on storage.objects;
create policy "an owner deletes their asset pictures"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'assets'
    and public.is_business_owner(((storage.foldername(name))[2])::uuid)
  );

create or replace function public.set_asset_photo(p_asset_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select a.business_id into v_business from public.assets a where a.id = p_asset_id and a.deleted_at is null;
  if v_business is null then
    raise exception 'that asset does not exist';
  end if;
  if not public.is_business_owner(v_business) then
    raise exception 'only the owner changes what the business owns';
  end if;
  /* the path is checked against THIS business's own folder — the storage policy's
     rule said again, so a row can never point at a file somebody else owns */
  if p_path is not null and p_path !~ ('^assets/' || v_business::text || '/[^/]+$') then
    raise exception 'that file is not in this business''s own assets folder';
  end if;
  update public.assets set photo_path = p_path, updated_by = auth.uid() where id = p_asset_id;
end;
$$;

revoke all on function public.set_asset_photo(uuid, text) from public, anon;
grant execute on function public.set_asset_photo(uuid, text) to authenticated, service_role;

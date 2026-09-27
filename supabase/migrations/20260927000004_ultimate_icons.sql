-- Supabase Storage is unavailable in PGlite; this migration is conditional so
-- the domain test database can still apply the complete migration chain.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('ultimate-icons', 'ultimate-icons', true, 2097152,
        array['image/png', 'image/webp'])
      on conflict (id) do update set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
    execute 'create policy "ultimate_icons_admin_insert" on storage.objects for insert to authenticated with check (bucket_id = ''ultimate-icons'' and (select private.has_role(''ADMIN'')))';
    execute 'create policy "ultimate_icons_admin_delete" on storage.objects for delete to authenticated using (bucket_id = ''ultimate-icons'' and (select private.has_role(''ADMIN'')))';
  end if;
end;
$$;

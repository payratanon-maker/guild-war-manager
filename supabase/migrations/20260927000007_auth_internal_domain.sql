-- Replace the hosted-incompatible .invalid Auth identity with ICANN's
-- permanently reserved private-use .internal namespace. No email is received.
-- Keep the strict username/address pairing and PENDING/no-role profile insert.
create or replace function private.create_account_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare requested_username text;
begin
  requested_username := new.raw_user_meta_data ->> 'username';
  if requested_username is null or requested_username !~ '^[A-Za-z0-9_]{3,32}$'
     or lower(new.email) <> lower(requested_username) || '@users.guild-war-manager.internal' then
    raise exception 'invalid account username';
  end if;
  insert into public.account_profiles (id, username) values (new.id, requested_username);
  return new;
end;
$$;

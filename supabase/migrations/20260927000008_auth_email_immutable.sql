-- Keep username-only logins stable even if Auth's email-change API is called.
-- Verified contact changes need a future product decision and migration.
create function private.reject_account_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    raise exception 'internal auth email cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_account_email_change() from public;
create trigger auth_user_email_immutable before update of email on auth.users
for each row execute function private.reject_account_email_change();

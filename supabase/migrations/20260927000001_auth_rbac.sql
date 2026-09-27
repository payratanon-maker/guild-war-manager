-- Phase 2: Auth identity and least-privilege access. Apply after the domain migration.
-- Username-only login uses an internal .invalid email; disable email confirmation
-- in Supabase Auth before opening registration (documented in README).

create schema if not exists private;

create function private.current_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.account_profiles
  where id = (select auth.uid()) and status = 'APPROVED'
$$;
revoke all on function private.current_role() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;

create function private.has_role(required public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case private.current_role()
      when 'OWNER' then true
      when 'ADMIN' then required in ('MEMBER', 'OFFICER', 'ADMIN')
      when 'OFFICER' then required in ('MEMBER', 'OFFICER')
      when 'MEMBER' then required = 'MEMBER'
      else false end
  ), false)
$$;
revoke all on function private.has_role(public.app_role) from public;
grant execute on function private.has_role(public.app_role) to authenticated;

create function private.create_account_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare requested_username text;
begin
  requested_username := new.raw_user_meta_data ->> 'username';
  if requested_username is null or requested_username !~ '^[A-Za-z0-9_]{3,32}$'
     or lower(new.email) <> lower(requested_username) || '@users.guild-war-manager.invalid' then
    raise exception 'invalid account username';
  end if;
  insert into public.account_profiles (id, username) values (new.id, requested_username);
  return new;
end;
$$;
revoke all on function private.create_account_profile() from public;
create trigger auth_user_profile after insert on auth.users
for each row execute function private.create_account_profile();

-- The first OWNER is provisioned once by a database administrator. Never
-- bootstrap an OWNER from a public signup or an application service key.
create function public.decide_account(target_id uuid, decision public.account_status,
  approved_role public.app_role default null) returns void
language plpgsql security definer set search_path = '' as $$
declare actor_role public.app_role;
declare target public.account_profiles%rowtype;
begin
  actor_role := private.current_role();
  if actor_role is null or actor_role not in ('ADMIN', 'OWNER') then
    raise exception 'admin approval required' using errcode = '42501';
  end if;
  select * into target from public.account_profiles where id = target_id for update;
  if not found then raise exception 'account not found'; end if;
  if decision = 'PENDING' or (decision = 'REJECTED' and approved_role is not null)
     or (decision = 'APPROVED' and approved_role is null) then
    raise exception 'invalid account decision';
  end if;
  if actor_role = 'ADMIN' and (approved_role in ('ADMIN', 'OWNER')
      or target.role in ('ADMIN', 'OWNER')) then
    raise exception 'owner role management required' using errcode = '42501';
  end if;
  if approved_role = 'OWNER' and actor_role <> 'OWNER' then
    raise exception 'owner role management required' using errcode = '42501';
  end if;
  if target.role = 'OWNER' and target.id = auth.uid() then
    raise exception 'owner cannot change own role' using errcode = '42501';
  end if;
  update public.account_profiles
    set status = decision, role = case when decision = 'APPROVED' then approved_role else null end,
        decided_at = now(), decided_by = auth.uid()
    where id = target_id;
end;
$$;
revoke all on function public.decide_account(uuid, public.account_status, public.app_role) from public;
grant execute on function public.decide_account(uuid, public.account_status, public.app_role) to authenticated;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.account_profiles, public.guild_players, public.ultimates,
  public.wars, public.current_formation, public.current_formation_assignments,
  public.war_attendance, public.war_assignments, public.war_player_stats to authenticated;
grant insert, update on public.guild_players, public.ultimates to authenticated;
grant insert, update on public.wars, public.war_attendance,
  public.current_formation_assignments, public.war_player_stats to authenticated;
grant delete on public.current_formation_assignments to authenticated;
grant usage, select on sequence public.wars_war_number_seq to authenticated;

create policy profile_self_or_admin on public.account_profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.has_role('ADMIN')));
create policy approved_read_players on public.guild_players for select to authenticated
  using ((select private.has_role('MEMBER')));
create policy admin_insert_players on public.guild_players for insert to authenticated
  with check ((select private.has_role('ADMIN')));
create policy admin_update_players on public.guild_players for update to authenticated
  using ((select private.has_role('ADMIN'))) with check ((select private.has_role('ADMIN')));
create policy approved_read_ultimates on public.ultimates for select to authenticated
  using ((select private.has_role('MEMBER')));
create policy admin_insert_ultimates on public.ultimates for insert to authenticated
  with check ((select private.has_role('ADMIN')));
create policy admin_update_ultimates on public.ultimates for update to authenticated
  using ((select private.has_role('ADMIN'))) with check ((select private.has_role('ADMIN')));
create policy approved_read_wars on public.wars for select to authenticated
  using ((select private.has_role('MEMBER')));
create policy officer_insert_wars on public.wars for insert to authenticated
  with check ((select private.has_role('OFFICER')));
create policy officer_update_wars on public.wars for update to authenticated
  using ((select private.has_role('OFFICER'))) with check ((select private.has_role('OFFICER')));
create policy approved_read_current_formation on public.current_formation for select to authenticated
  using ((select private.has_role('MEMBER')));
create policy approved_read_formation_assignments on public.current_formation_assignments for select to authenticated
  using ((select private.has_role('MEMBER')));
create policy officer_insert_formation_assignments on public.current_formation_assignments for insert to authenticated
  with check ((select private.has_role('OFFICER')));
create policy officer_update_formation_assignments on public.current_formation_assignments for update to authenticated
  using ((select private.has_role('OFFICER'))) with check ((select private.has_role('OFFICER')));
create policy officer_delete_formation_assignments on public.current_formation_assignments for delete to authenticated
  using ((select private.has_role('OFFICER')));
create policy approved_read_attendance on public.war_attendance for select to authenticated
  using ((select private.has_role('MEMBER')));
create policy officer_insert_attendance on public.war_attendance for insert to authenticated
  with check ((select private.has_role('OFFICER')));
create policy officer_update_attendance on public.war_attendance for update to authenticated
  using ((select private.has_role('OFFICER'))) with check ((select private.has_role('OFFICER')));
create policy approved_read_war_assignments on public.war_assignments for select to authenticated
  using ((select private.has_role('MEMBER')));
create policy approved_read_stats on public.war_player_stats for select to authenticated
  using ((select private.has_role('MEMBER')));
create policy officer_insert_stats on public.war_player_stats for insert to authenticated
  with check ((select private.has_role('OFFICER')));
create policy officer_update_stats on public.war_player_stats for update to authenticated
  using ((select private.has_role('OFFICER'))) with check ((select private.has_role('OFFICER')));

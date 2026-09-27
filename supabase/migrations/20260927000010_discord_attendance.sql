-- Phase 10: stable Discord identity mapping and a narrowly callable bot RPC.
grant select, insert, delete on public.discord_player_links to authenticated;

create policy admin_read_discord_links on public.discord_player_links for select to authenticated
  using ((select private.has_role('ADMIN')));
create policy admin_insert_discord_links on public.discord_player_links for insert to authenticated
  with check ((select private.has_role('ADMIN')));
create policy admin_delete_discord_links on public.discord_player_links for delete to authenticated
  using ((select private.has_role('ADMIN')));

create function private.guard_discord_player_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.guild_players
    where id = new.player_id and archived_at is null
  ) then
    raise exception 'Discord links require an active Guild Player'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_discord_player_link() from public;
create trigger discord_player_link_active_guard
before insert or update of player_id on public.discord_player_links
for each row execute function private.guard_discord_player_link();

create function public.discord_set_attendance(
  discord_id text,
  target_status public.attendance_status,
  requested_war_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare player_target uuid;
declare war_target uuid;
declare player_archived_at timestamptz;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception 'Discord integration service role required' using errcode = '42501';
  end if;
  if discord_id !~ '^[0-9]{17,20}$'
     or target_status not in ('AVAILABLE', 'LEAVE') then
    raise exception 'invalid Discord attendance request' using errcode = '22023';
  end if;
  select l.player_id, p.archived_at into player_target, player_archived_at
    from public.discord_player_links l
    join public.guild_players p on p.id = l.player_id
    where l.discord_user_id = discord_id;
  if not found then
    raise exception 'Discord user is not linked to a Guild Player' using errcode = 'P0002';
  end if;
  if player_archived_at is not null then
    raise exception 'archived Guild Players cannot change attendance' using errcode = '42501';
  end if;
  if requested_war_id is null then
    select id into war_target from public.wars
      where status = 'preparing'
      order by war_number desc
      limit 1 for update;
  else
    select id into war_target from public.wars
      where id = requested_war_id and status = 'preparing'
      for update;
  end if;
  if not found then
    raise exception 'no matching War is preparing' using errcode = '22023';
  end if;
  insert into public.war_attendance (war_id, player_id, status)
    values (war_target, player_target, target_status)
    on conflict (war_id, player_id) do update
      set status = excluded.status
      where public.war_attendance.status is distinct from excluded.status;
end;
$$;
revoke all on function public.discord_set_attendance(text, public.attendance_status, uuid) from public;
grant execute on function public.discord_set_attendance(text, public.attendance_status, uuid) to service_role;

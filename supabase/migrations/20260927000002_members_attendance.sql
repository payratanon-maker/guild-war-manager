-- Phase 4: protect mutable columns and disallow assigning a player on Leave.
revoke update on public.guild_players, public.ultimates, public.wars,
  public.current_formation_assignments, public.war_attendance,
  public.war_player_stats from authenticated;
grant update (display_name, current_class, archived_at) on public.guild_players to authenticated;
grant update (name, icon_storage_path, active) on public.ultimates to authenticated;
grant update (war_date, status) on public.wars to authenticated;
grant update (party, squad_number, slot_number, ultimate_id) on public.current_formation_assignments to authenticated;
grant update (status) on public.war_attendance to authenticated;
grant update (kills, deaths, assists, damage, healing, damage_taken,
  tower_damage, revives) on public.war_player_stats to authenticated;

create function private.reject_leave_formation_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.war_attendance a
    join public.wars w on w.id = a.war_id
    where a.player_id = new.player_id and a.status = 'LEAVE'
      and w.status = 'preparing'
  ) then
    raise exception 'player on Leave cannot join current formation';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_leave_formation_assignment() from public;
create trigger reject_leave_formation_assignment
before insert or update on public.current_formation_assignments
for each row execute function private.reject_leave_formation_assignment();

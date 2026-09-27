-- Phase 5: one atomic, authorized move for drag, keyboard, and touch flows.
create function public.move_formation_player(
  moved_player_id uuid,
  destination_party public.party_code default null,
  destination_squad smallint default null,
  destination_slot smallint default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare source_row public.current_formation_assignments%rowtype;
declare target_row public.current_formation_assignments%rowtype;
declare chosen_slot smallint;
declare player_archived_at timestamptz;
begin
  if not private.has_role('OFFICER') then
    raise exception 'officer role required' using errcode = '42501';
  end if;
  if destination_party is null and (destination_squad is not null or destination_slot is not null)
     or destination_party is not null and (destination_squad not between 1 and 5
       or destination_slot is not null and destination_slot not between 1 and 6) then
    raise exception 'invalid formation destination';
  end if;
  perform 1 from public.current_formation where id = 1 for update;
  select archived_at into player_archived_at from public.guild_players where id = moved_player_id for share;
  if not found or player_archived_at is not null then
    raise exception 'archived or missing player cannot join formation';
  end if;
  select * into source_row from public.current_formation_assignments
    where player_id = moved_player_id;
  if destination_party is null then
    delete from public.current_formation_assignments where player_id = moved_player_id;
    return;
  end if;
  if exists (
    select 1 from public.war_attendance a join public.wars w on w.id = a.war_id
    where a.player_id = moved_player_id and a.status = 'LEAVE' and w.status = 'preparing'
  ) then
    raise exception 'player on Leave cannot join formation';
  end if;
  if destination_slot is null then
    select s into chosen_slot from generate_series(1,6) s
    where not exists (
      select 1 from public.current_formation_assignments a
      where a.party = destination_party and a.squad_number = destination_squad
        and a.slot_number = s
    ) order by s limit 1;
    if chosen_slot is null then raise exception 'squad is full'; end if;
  else
    chosen_slot := destination_slot;
  end if;
  if source_row.player_id is not null and source_row.party = destination_party
     and source_row.squad_number = destination_squad and source_row.slot_number = chosen_slot then
    return;
  end if;
  select * into target_row from public.current_formation_assignments
    where party = destination_party and squad_number = destination_squad
      and slot_number = chosen_slot;
  set constraints public.current_formation_slot_unique deferred;
  if target_row.player_id is not null then
    if source_row.player_id is not null then
      update public.current_formation_assignments
        set party = source_row.party, squad_number = source_row.squad_number,
            slot_number = source_row.slot_number
        where player_id = target_row.player_id;
    else
      select s into destination_slot from generate_series(1,6) s
      where not exists (
        select 1 from public.current_formation_assignments a
        where a.party = destination_party and a.squad_number = destination_squad
          and a.slot_number = s
      ) order by s limit 1;
      if destination_slot is null then raise exception 'squad is full'; end if;
      update public.current_formation_assignments set slot_number = destination_slot
        where player_id = target_row.player_id;
    end if;
  end if;
  if source_row.player_id is null then
    insert into public.current_formation_assignments
      (player_id, party, squad_number, slot_number)
      values (moved_player_id, destination_party, destination_squad, chosen_slot);
  else
    update public.current_formation_assignments
      set party = destination_party, squad_number = destination_squad,
          slot_number = chosen_slot where player_id = moved_player_id;
  end if;
end;
$$;
revoke all on function public.move_formation_player(uuid, public.party_code, smallint, smallint) from public;
grant execute on function public.move_formation_player(uuid, public.party_code, smallint, smallint) to authenticated;

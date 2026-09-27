-- Marking Leave removes the player from Current Formation in the same write.
-- The previous guard blocks adding that player back while any preparing War
-- still records Leave.
create function private.unassign_player_on_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'LEAVE' then
    delete from public.current_formation_assignments where player_id = new.player_id;
  end if;
  return new;
end;
$$;
revoke all on function private.unassign_player_on_leave() from public;
create trigger war_attendance_unassign_on_leave
after insert or update of status on public.war_attendance
for each row execute function private.unassign_player_on_leave();

-- Repair a database that ran the earlier Attendance migration before this one.
delete from public.current_formation_assignments f
using public.war_attendance a, public.wars w
where f.player_id = a.player_id and a.war_id = w.id
  and a.status = 'LEAVE' and w.status = 'preparing';

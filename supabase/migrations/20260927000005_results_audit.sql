-- Phase 7: record the actual authenticated editor even for direct Data API calls.
create function private.stamp_stats_editor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.entered_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_stats_editor() from public;
create trigger war_player_stats_editor before insert or update on public.war_player_stats
for each row execute function private.stamp_stats_editor();

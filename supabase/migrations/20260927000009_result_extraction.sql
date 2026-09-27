-- Phase 9: private source screenshots and an Officer-reviewed candidate boundary.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('war-result-screenshots', 'war-result-screenshots', false, 10485760,
      array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
    execute 'create policy "war_screenshots_officer_insert" on storage.objects for insert to authenticated with check (bucket_id = ''war-result-screenshots'' and (select private.has_role(''OFFICER'')))';
    execute 'create policy "war_screenshots_officer_read" on storage.objects for select to authenticated using (bucket_id = ''war-result-screenshots'' and (select private.has_role(''OFFICER'')))';
    execute 'create policy "war_screenshots_officer_delete" on storage.objects for delete to authenticated using (bucket_id = ''war-result-screenshots'' and (select private.has_role(''OFFICER'')))';
  end if;
end;
$$;

grant select, insert, delete on public.war_result_uploads to authenticated;
grant select, insert, update on public.war_extraction_candidates to authenticated;

create policy officer_read_result_uploads on public.war_result_uploads for select to authenticated
  using ((select private.has_role('OFFICER')));
create policy officer_insert_result_uploads on public.war_result_uploads for insert to authenticated
  with check ((select private.has_role('OFFICER')) and exists (
    select 1 from public.wars where id = war_id and status = 'finalized'
  ));
create policy officer_cleanup_result_uploads on public.war_result_uploads for delete to authenticated
  using ((select private.has_role('OFFICER')) and not exists (
    select 1 from public.war_extraction_candidates c where c.upload_id = war_result_uploads.id
  ));
create policy officer_read_extraction_candidates on public.war_extraction_candidates for select to authenticated
  using ((select private.has_role('OFFICER')));
create policy officer_insert_extraction_candidates on public.war_extraction_candidates for insert to authenticated
  with check ((select private.has_role('OFFICER')) and exists (
    select 1 from public.war_result_uploads u join public.wars w on w.id = u.war_id
    where u.id = upload_id and w.status = 'finalized'
  ));
create policy officer_update_extraction_candidates on public.war_extraction_candidates for update to authenticated
  using ((select private.has_role('OFFICER')) and status in ('pending', 'reviewed'))
  with check ((select private.has_role('OFFICER')) and status in ('pending', 'reviewed', 'rejected'));

create function public.review_extraction_candidate(target_id uuid, corrected jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare candidate public.war_extraction_candidates%rowtype;
begin
  if not (select private.has_role('OFFICER')) then
    raise exception 'officer role required' using errcode = '42501';
  end if;
  if jsonb_typeof(corrected) <> 'object' or jsonb_typeof(corrected -> 'records') <> 'array' then
    raise exception 'candidate records must be an array' using errcode = '22023';
  end if;
  select * into candidate from public.war_extraction_candidates
    where id = target_id for update;
  if not found or candidate.status not in ('pending', 'reviewed') then
    raise exception 'candidate is not reviewable' using errcode = '22023';
  end if;
  update public.war_extraction_candidates
    set candidate_payload = corrected, status = 'reviewed',
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = target_id;
end;
$$;

create function public.confirm_extraction_candidate(target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare candidate public.war_extraction_candidates%rowtype;
declare war_target uuid;
declare item jsonb;
declare assignment_target uuid;
declare stat_values bigint[];
declare field_name text;
declare field_value jsonb;
declare index_value integer;
begin
  if not (select private.has_role('OFFICER')) then
    raise exception 'officer role required' using errcode = '42501';
  end if;
  select c.* into candidate from public.war_extraction_candidates c
    where c.id = target_id for update;
  if not found or candidate.status <> 'reviewed' then
    raise exception 'candidate must be reviewed before confirmation' using errcode = '22023';
  end if;
  select u.war_id into war_target from public.war_result_uploads u
    where u.id = candidate.upload_id;
  if not found or not exists (
    select 1 from public.wars w where w.id = war_target and w.status = 'finalized'
  ) then
    raise exception 'candidate must belong to a finalized War' using errcode = '22023';
  end if;
  if jsonb_typeof(candidate.candidate_payload -> 'records') <> 'array'
     or jsonb_array_length(candidate.candidate_payload -> 'records') = 0 then
    raise exception 'at least one reviewed result is required' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(candidate.candidate_payload -> 'records')
  loop
    if jsonb_typeof(item) <> 'object'
       or coalesce(item ->> 'assignmentId', '') !~ '^[0-9a-fA-F-]{36}$'
       or jsonb_typeof(item -> 'stats') <> 'object' then
      raise exception 'invalid result row' using errcode = '22023';
    end if;
    assignment_target := (item ->> 'assignmentId')::uuid;
    if not exists (select 1 from public.war_assignments
      where id = assignment_target and war_id = war_target) then
      raise exception 'assignment does not belong to this War' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(candidate.candidate_payload -> 'records') as records(value)
      where value ->> 'assignmentId' = item ->> 'assignmentId'
      group by value ->> 'assignmentId' having count(*) > 1
    ) then
      raise exception 'duplicate assignment in reviewed results' using errcode = '22023';
    end if;
    stat_values := array[]::bigint[];
    foreach field_name in array array['kills','deaths','assists','damage','healing','damageTaken','towerDamage','revives']
    loop
      field_value := item -> 'stats' -> field_name;
      if field_name = 'revives' and (field_value is null or field_value = 'null'::jsonb or field_value = '""'::jsonb) then
        stat_values := array_append(stat_values, null);
      else
        if jsonb_typeof(field_value) <> 'number'
          or coalesce(field_value #>> '{}', '') !~ '^(0|[1-9][0-9]*)$'
          or (field_value #>> '{}')::numeric > 9007199254740991 then
          raise exception 'invalid nonnegative statistic: %', field_name using errcode = '22023';
        end if;
        stat_values := array_append(stat_values, (field_value #>> '{}')::bigint);
      end if;
    end loop;
    insert into public.war_player_stats (
      war_assignment_id, kills, deaths, assists, damage, healing,
      damage_taken, tower_damage, revives, entered_by
    ) values (
      assignment_target, stat_values[1], stat_values[2], stat_values[3],
      stat_values[4], stat_values[5], stat_values[6], stat_values[7],
      stat_values[8], auth.uid()
    ) on conflict (war_assignment_id) do update set
      kills = excluded.kills, deaths = excluded.deaths, assists = excluded.assists,
      damage = excluded.damage, healing = excluded.healing,
      damage_taken = excluded.damage_taken, tower_damage = excluded.tower_damage,
      revives = excluded.revives, entered_by = excluded.entered_by;
  end loop;

  update public.war_extraction_candidates
    set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now()
    where id = target_id;
end;
$$;

revoke all on function public.review_extraction_candidate(uuid, jsonb) from public;
grant execute on function public.review_extraction_candidate(uuid, jsonb) to authenticated;
revoke all on function public.confirm_extraction_candidate(uuid) from public;
grant execute on function public.confirm_extraction_candidate(uuid) to authenticated;

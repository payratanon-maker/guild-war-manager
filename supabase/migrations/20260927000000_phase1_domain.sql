-- Phase 1: one-guild domain model. Auth users and Storage are managed by Supabase.
-- Client access is closed by RLS until Phase 2 adds reviewed policies and RPCs.

create type public.account_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.app_role as enum ('MEMBER', 'OFFICER', 'ADMIN', 'OWNER');
create type public.guild_class as enum (
  'ironclad', 'sylph', 'bloodstrom', 'celestune',
  'nightwaker', 'numina', 'dragonsvelte'
);
create type public.attendance_status as enum ('UNKNOWN', 'AVAILABLE', 'LEAVE');
create type public.war_status as enum ('preparing', 'finalized');
create type public.party_code as enum ('A', 'B');
create type public.extraction_status as enum ('pending', 'reviewed', 'rejected', 'confirmed');
-- Keep JSON/TypeScript number values exact while retaining bigint headroom.
create domain public.nonnegative_stat as bigint
  check (value between 0 and 9007199254740991);

create table public.account_profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  username text not null check (
    char_length(username) between 3 and 32 and username = btrim(username)
  ),
  status public.account_status not null default 'PENDING',
  role public.app_role,
  decided_at timestamptz,
  decided_by uuid references public.account_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_profile_decision_consistent check (
    (status = 'PENDING' and role is null and decided_at is null) or
    (status = 'REJECTED' and role is null and decided_at is not null) or
    (status = 'APPROVED' and role is not null and decided_at is not null)
  )
);
create unique index account_profiles_username_ci on public.account_profiles (lower(username));

create table public.guild_players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (
    char_length(btrim(display_name)) between 1 and 100 and display_name = btrim(display_name)
  ),
  current_class public.guild_class not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guild_players_active_class on public.guild_players (current_class)
  where archived_at is null;

create table public.ultimates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{1,50}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  icon_storage_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.wars (
  id uuid primary key default gen_random_uuid(),
  war_number bigint generated always as identity unique,
  war_date date not null,
  status public.war_status not null default 'preparing',
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  constraint war_status_consistent check (
    (status = 'preparing' and finalized_at is null) or
    (status = 'finalized' and finalized_at is not null)
  )
);

create table public.current_formation (
  id smallint primary key default 1 check (id = 1),
  created_at timestamptz not null default now()
);
insert into public.current_formation (id) values (1);

create table public.current_formation_assignments (
  player_id uuid primary key references public.guild_players (id) on delete restrict,
  formation_id smallint not null default 1 references public.current_formation (id) on delete restrict,
  party public.party_code not null,
  squad_number smallint not null check (squad_number between 1 and 5),
  slot_number smallint not null check (slot_number between 1 and 6),
  ultimate_id uuid references public.ultimates (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint current_formation_slot_unique
    unique (formation_id, party, squad_number, slot_number)
    deferrable initially immediate
);

create table public.war_attendance (
  war_id uuid not null references public.wars (id) on delete restrict,
  player_id uuid not null references public.guild_players (id) on delete restrict,
  status public.attendance_status not null default 'UNKNOWN',
  updated_at timestamptz not null default now(),
  primary key (war_id, player_id)
);
create index war_attendance_player on public.war_attendance (player_id);

create table public.war_assignments (
  id uuid primary key default gen_random_uuid(),
  war_id uuid not null references public.wars (id) on delete restrict,
  player_id uuid not null references public.guild_players (id) on delete restrict,
  player_name_snapshot text not null,
  class_snapshot public.guild_class not null,
  party public.party_code not null,
  squad_number smallint not null check (squad_number between 1 and 5),
  slot_number smallint not null check (slot_number between 1 and 6),
  ultimate_id uuid references public.ultimates (id) on delete restrict,
  ultimate_code_snapshot text,
  ultimate_name_snapshot text,
  ultimate_icon_path_snapshot text,
  attendance_snapshot public.attendance_status not null,
  created_at timestamptz not null default now(),
  unique (war_id, player_id),
  unique (war_id, party, squad_number, slot_number),
  constraint ultimate_snapshot_consistent check (
    (ultimate_id is null and ultimate_code_snapshot is null and ultimate_name_snapshot is null and ultimate_icon_path_snapshot is null) or
    (ultimate_id is not null and ultimate_code_snapshot is not null and ultimate_name_snapshot is not null)
  )
);
create index war_assignments_player on public.war_assignments (player_id);

create table public.war_player_stats (
  war_assignment_id uuid primary key references public.war_assignments (id) on delete restrict,
  kills public.nonnegative_stat not null default 0,
  deaths public.nonnegative_stat not null default 0,
  assists public.nonnegative_stat not null default 0,
  damage public.nonnegative_stat not null default 0,
  healing public.nonnegative_stat not null default 0,
  damage_taken public.nonnegative_stat not null default 0,
  tower_damage public.nonnegative_stat not null default 0,
  revives public.nonnegative_stat,
  entered_by uuid references public.account_profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Extraction candidates are deliberately separate from official statistics.
create table public.war_result_uploads (
  id uuid primary key default gen_random_uuid(),
  war_id uuid not null references public.wars (id) on delete restrict,
  storage_path text not null unique check (char_length(btrim(storage_path)) > 0),
  uploaded_by uuid references public.account_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index war_result_uploads_war on public.war_result_uploads (war_id);

create table public.war_extraction_candidates (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.war_result_uploads (id) on delete restrict,
  provider text not null check (char_length(btrim(provider)) > 0),
  candidate_payload jsonb not null check (jsonb_typeof(candidate_payload) = 'object'),
  status public.extraction_status not null default 'pending',
  reviewed_by uuid references public.account_profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint extraction_review_consistent check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null) or
    (status <> 'pending' and reviewed_at is not null and reviewed_by is not null)
  )
);
create index war_extraction_candidates_upload on public.war_extraction_candidates (upload_id);

create table public.discord_player_links (
  player_id uuid primary key references public.guild_players (id) on delete restrict,
  discord_user_id text not null unique check (discord_user_id ~ '^[0-9]{1,30}$'),
  linked_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger account_profiles_touch_updated_at before update on public.account_profiles
for each row execute function public.touch_updated_at();
create trigger guild_players_touch_updated_at before update on public.guild_players
for each row execute function public.touch_updated_at();
create trigger war_attendance_touch_updated_at before update on public.war_attendance
for each row execute function public.touch_updated_at();
create trigger war_player_stats_touch_updated_at before update on public.war_player_stats
for each row execute function public.touch_updated_at();

create function public.protect_guild_player() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'guild players must be archived, not deleted';
  end if;
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.current_formation_assignments where player_id = new.id
  ) then
    raise exception 'remove player from current formation before archiving';
  end if;
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.war_attendance a
    join public.wars w on w.id = a.war_id
    where a.player_id = new.id and w.status = 'preparing' and a.status = 'AVAILABLE'
  ) then
    raise exception 'clear future War availability before archiving';
  end if;
  return new;
end;
$$;
create trigger guild_players_protect before update or delete on public.guild_players
for each row execute function public.protect_guild_player();

create function public.protect_current_formation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'the persistent current formation cannot be deleted';
end;
$$;
create trigger current_formation_protect before delete on public.current_formation
for each row execute function public.protect_current_formation();

create function public.guard_current_formation_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  player_archived_at timestamptz;
  ultimate_active boolean;
begin
  -- Serialize all formation edits with War finalization.
  perform 1 from public.current_formation
    where id = case when tg_op = 'DELETE' then old.formation_id else new.formation_id end
    for update;
  if not found then
    raise exception 'current formation does not exist';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  select archived_at into player_archived_at
    from public.guild_players where id = new.player_id for share;
  if not found then
    raise exception 'guild player does not exist';
  end if;
  if player_archived_at is not null then
    raise exception 'archived player cannot join current formation';
  end if;
  if new.ultimate_id is not null then
    select active into ultimate_active from public.ultimates
      where id = new.ultimate_id for share;
    if not found or not ultimate_active then
      raise exception 'ultimate is missing or inactive';
    end if;
  end if;
  return new;
end;
$$;
create trigger current_formation_assignment_guard
before insert or update or delete on public.current_formation_assignments
for each row execute function public.guard_current_formation_assignment();

create function public.guard_war_attendance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  current_war_status public.war_status;
  player_archived_at timestamptz;
begin
  select status into current_war_status from public.wars
    where id = case when tg_op = 'DELETE' then old.war_id else new.war_id end
    for update;
  if not found or current_war_status <> 'preparing' then
    raise exception 'attendance can only change for a preparing War';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.war_id <> old.war_id or new.player_id <> old.player_id) then
    raise exception 'attendance identity cannot change';
  end if;
  select archived_at into player_archived_at from public.guild_players
    where id = new.player_id for share;
  if not found or player_archived_at is not null then
    raise exception 'archived or missing player cannot join War attendance';
  end if;
  return new;
end;
$$;
create trigger war_attendance_guard before insert or update or delete on public.war_attendance
for each row execute function public.guard_war_attendance();

create function public.guard_war_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  current_war_status public.war_status;
  player_record record;
  ultimate_record record;
  recorded_attendance public.attendance_status;
begin
  if tg_op = 'UPDATE' then
    raise exception 'War assignment snapshots cannot be edited';
  end if;
  select status into current_war_status from public.wars
    where id = case when tg_op = 'DELETE' then old.war_id else new.war_id end
    for update;
  if not found or current_war_status <> 'preparing' then
    raise exception 'War assignment snapshots are frozen';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  select display_name, current_class, archived_at into player_record
    from public.guild_players where id = new.player_id for share;
  if not found or player_record.archived_at is not null then
    raise exception 'archived or missing player cannot join War';
  end if;
  select status into recorded_attendance from public.war_attendance
    where war_id = new.war_id and player_id = new.player_id;
  if recorded_attendance = 'LEAVE' then
    raise exception 'player on Leave cannot join War';
  end if;
  new.player_name_snapshot := player_record.display_name;
  new.class_snapshot := player_record.current_class;
  new.attendance_snapshot := coalesce(recorded_attendance, 'UNKNOWN');

  if new.ultimate_id is null then
    new.ultimate_code_snapshot := null;
    new.ultimate_name_snapshot := null;
    new.ultimate_icon_path_snapshot := null;
  else
    select code, name, icon_storage_path into ultimate_record
      from public.ultimates where id = new.ultimate_id for share;
    if not found then
      raise exception 'ultimate does not exist';
    end if;
    new.ultimate_code_snapshot := ultimate_record.code;
    new.ultimate_name_snapshot := ultimate_record.name;
    new.ultimate_icon_path_snapshot := ultimate_record.icon_storage_path;
  end if;
  return new;
end;
$$;
create trigger war_assignment_guard before insert or update or delete on public.war_assignments
for each row execute function public.guard_war_assignment();

create function public.guard_war_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'preparing' or new.finalized_at is not null then
      raise exception 'a new War must begin in preparing status';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'finalized' then
      raise exception 'finalized Wars cannot be deleted';
    end if;
    return old;
  end if;
  if new.id <> old.id or new.war_number <> old.war_number then
    raise exception 'War identity cannot change';
  end if;
  if old.status = 'finalized' then
    raise exception 'finalized Wars cannot be edited';
  end if;
  if new.status = 'preparing' then
    return new;
  end if;

  -- The War row is already locked by UPDATE. Formation writes lock this
  -- singleton row first, so the copied lineup is one consistent version.
  perform 1 from public.current_formation where id = 1 for update;
  delete from public.war_assignments where war_id = old.id;
  insert into public.war_assignments (
    war_id, player_id, party, squad_number, slot_number, ultimate_id
  )
  select old.id, player_id, party, squad_number, slot_number, ultimate_id
    from public.current_formation_assignments
    where formation_id = 1
    order by party, squad_number, slot_number;
  new.finalized_at := now();
  return new;
end;
$$;
create trigger war_change_guard before insert or update or delete on public.wars
for each row execute function public.guard_war_change();

create function public.guard_war_player_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  current_war_status public.war_status;
begin
  if tg_op = 'UPDATE' and new.war_assignment_id <> old.war_assignment_id then
    raise exception 'statistic assignment cannot change';
  end if;
  select w.status into current_war_status
    from public.war_assignments a
    join public.wars w on w.id = a.war_id
    where a.id = new.war_assignment_id;
  if not found or current_war_status <> 'finalized' then
    raise exception 'official statistics require a finalized War assignment';
  end if;
  return new;
end;
$$;
create trigger war_player_stats_guard before insert or update on public.war_player_stats
for each row execute function public.guard_war_player_stats();

-- No client policies in Phase 1: pending and unapproved accounts cannot read
-- guild data. Phase 2 must add least-privilege grants/policies deliberately.
alter table public.account_profiles enable row level security;
alter table public.guild_players enable row level security;
alter table public.ultimates enable row level security;
alter table public.wars enable row level security;
alter table public.current_formation enable row level security;
alter table public.current_formation_assignments enable row level security;
alter table public.war_attendance enable row level security;
alter table public.war_assignments enable row level security;
alter table public.war_player_stats enable row level security;
alter table public.war_result_uploads enable row level security;
alter table public.war_extraction_candidates enable row level security;
alter table public.discord_player_links enable row level security;

revoke all on function public.touch_updated_at() from public;
revoke all on function public.protect_guild_player() from public;
revoke all on function public.protect_current_formation() from public;
revoke all on function public.guard_current_formation_assignment() from public;
revoke all on function public.guard_war_attendance() from public;
revoke all on function public.guard_war_assignment() from public;
revoke all on function public.guard_war_change() from public;
revoke all on function public.guard_war_player_stats() from public;

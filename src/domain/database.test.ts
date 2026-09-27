import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { guildClasses } from "../lib/guild-classes";
import {
  accountStatuses,
  attendanceStatuses,
  extractionStatuses,
  parties,
  roles,
  warStatuses,
} from "./model";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260927000000_phase1_domain.sql",
    import.meta.url,
  ),
  "utf8",
);

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;

let db: PGlite;

async function addPlayer(
  playerId: string,
  name = "Player",
  classId = "ironclad",
) {
  await db.query(
    "insert into public.guild_players (id, display_name, current_class) values ($1, $2, $3)",
    [playerId, name, classId],
  );
}

async function addWar(warId: string) {
  await db.query(
    "insert into public.wars (id, war_date) values ($1, '2026-09-27')",
    [warId],
  );
}

async function assign(
  playerId: string,
  party: "A" | "B" = "A",
  squad = 1,
  slot = 1,
  ultimateId: string | null = null,
) {
  await db.query(
    "insert into public.current_formation_assignments (player_id, party, squad_number, slot_number, ultimate_id) values ($1, $2, $3, $4, $5)",
    [playerId, party, squad, slot, ultimateId],
  );
}

async function enumLabels(name: string): Promise<string[]> {
  const result = await db.query<{ enumlabel: string }>(
    "select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = $1 order by e.enumsortorder",
    [name],
  );
  return result.rows.map(({ enumlabel }) => enumlabel);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(
    "create schema auth; create table auth.users (id uuid primary key); create role authenticated;",
  );
  await db.exec(migration);
});

afterEach(async () => {
  await db.close();
});

describe("Phase 1 PostgreSQL domain", () => {
  it("applies the migration and keeps application enums synchronized", async () => {
    expect(await enumLabels("guild_class")).toEqual(
      guildClasses.map(({ id: classId }) => classId),
    );
    expect(await enumLabels("account_status")).toEqual(accountStatuses);
    expect(await enumLabels("app_role")).toEqual(roles);
    expect(await enumLabels("attendance_status")).toEqual(attendanceStatuses);
    expect(await enumLabels("war_status")).toEqual(warStatuses);
    expect(await enumLabels("party_code")).toEqual(parties);
    expect(await enumLabels("extraction_status")).toEqual(extractionStatuses);

    const formation = await db.query<{ id: number }>(
      "select id from public.current_formation",
    );
    expect(formation.rows).toEqual([{ id: 1 }]);
    await expect(
      db.query("delete from public.current_formation where id = 1"),
    ).rejects.toThrow(/persistent current formation/);
  });

  it("keeps pending profiles role-free and usernames unique across case", async () => {
    await db.query("insert into auth.users (id) values ($1), ($2)", [
      id(101),
      id(102),
    ]);
    await db.query(
      "insert into public.account_profiles (id, username) values ($1, 'GuildLead')",
      [id(101)],
    );
    await expect(
      db.query(
        "insert into public.account_profiles (id, username) values ($1, 'guildlead')",
        [id(102)],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "update public.account_profiles set role = 'OWNER' where id = $1",
        [id(101)],
      ),
    ).rejects.toThrow(/account_profile_decision_consistent/);
    await db.query(
      "update public.account_profiles set status = 'APPROVED', role = 'MEMBER', decided_at = now() where id = $1",
      [id(101)],
    );
    const result = await db.query<{ role: string }>(
      "select role from public.account_profiles where id = $1",
      [id(101)],
    );
    expect(result.rows[0].role).toBe("MEMBER");
  });

  it("enforces six slots, unique placement, and one current assignment per player", async () => {
    for (let slot = 1; slot <= 7; slot += 1) {
      await addPlayer(id(slot), `Player ${slot}`);
    }
    for (let slot = 1; slot <= 6; slot += 1) {
      await assign(id(slot), "A", 1, slot);
    }
    await expect(assign(id(7), "A", 1, 7)).rejects.toThrow();
    await expect(assign(id(7), "A", 1, 1)).rejects.toThrow();
    await expect(assign(id(1), "B", 5, 6)).rejects.toThrow();
    const result = await db.query<{ count: number }>(
      "select count(*)::int as count from public.current_formation_assignments",
    );
    expect(result.rows[0].count).toBe(6);
  });

  it("enforces historical War placement even for direct database writes", async () => {
    await addPlayer(id(1));
    await addPlayer(id(2), "Second Player");
    await addWar(id(201));
    await db.query(
      "insert into public.war_assignments (war_id, player_id, party, squad_number, slot_number) values ($1, $2, 'A', 1, 1)",
      [id(201), id(1)],
    );
    await expect(
      db.query(
        "insert into public.war_assignments (war_id, player_id, party, squad_number, slot_number) values ($1, $2, 'B', 5, 6)",
        [id(201), id(1)],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.war_assignments (war_id, player_id, party, squad_number, slot_number) values ($1, $2, 'A', 1, 1)",
        [id(201), id(2)],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.war_assignments (war_id, player_id, party, squad_number, slot_number) values ($1, $2, 'A', 1, 7)",
        [id(201), id(2)],
      ),
    ).rejects.toThrow();
  });

  it("allows an atomic swap of occupied current slots", async () => {
    await addPlayer(id(1));
    await addPlayer(id(2), "Second Player");
    await assign(id(1), "A", 1, 1);
    await assign(id(2), "A", 1, 2);

    await db.exec(
      "begin; set constraints current_formation_slot_unique deferred;",
    );
    try {
      await db.query(
        "update public.current_formation_assignments set slot_number = case when player_id = $1 then 2 else 1 end where player_id in ($1, $2)",
        [id(1), id(2)],
      );
      await db.exec("commit");
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }

    const placements = await db.query<{
      player_id: string;
      slot_number: number;
    }>(
      "select player_id, slot_number from public.current_formation_assignments order by slot_number",
    );
    expect(placements.rows).toEqual([
      { player_id: id(2), slot_number: 1 },
      { player_id: id(1), slot_number: 2 },
    ]);
  });

  it("requires unassignment before archive and never hard-deletes a player", async () => {
    await addPlayer(id(1));
    await assign(id(1));
    await expect(
      db.query(
        "update public.guild_players set archived_at = now() where id = $1",
        [id(1)],
      ),
    ).rejects.toThrow(/remove player from current formation/);
    await db.query(
      "delete from public.current_formation_assignments where player_id = $1",
      [id(1)],
    );
    await addWar(id(201));
    await db.query(
      "insert into public.war_attendance (war_id, player_id, status) values ($1, $2, 'AVAILABLE')",
      [id(201), id(1)],
    );
    await expect(
      db.query(
        "update public.guild_players set archived_at = now() where id = $1",
        [id(1)],
      ),
    ).rejects.toThrow(/clear future War availability/);
    await db.query(
      "delete from public.war_attendance where war_id = $1 and player_id = $2",
      [id(201), id(1)],
    );
    await db.query(
      "update public.guild_players set archived_at = now() where id = $1",
      [id(1)],
    );
    await expect(assign(id(1))).rejects.toThrow(/archived player/);
    await addWar(id(202));
    await expect(
      db.query(
        "insert into public.war_attendance (war_id, player_id, status) values ($1, $2, 'AVAILABLE')",
        [id(202), id(1)],
      ),
    ).rejects.toThrow(/archived or missing player/);
    await expect(
      db.query("delete from public.guild_players where id = $1", [id(1)]),
    ).rejects.toThrow(/must be archived/);
    await db.query(
      "update public.guild_players set archived_at = null where id = $1",
      [id(1)],
    );
    await assign(id(1));
  });

  it("keeps attendance scoped to its War and rolls back a Leave snapshot", async () => {
    await addPlayer(id(1));
    await assign(id(1));
    await addWar(id(201));
    await addWar(id(202));
    await db.query(
      "insert into public.war_attendance (war_id, player_id, status) values ($1, $3, 'LEAVE'), ($2, $3, 'AVAILABLE')",
      [id(201), id(202), id(1)],
    );

    await expect(
      db.query("update public.wars set status = 'finalized' where id = $1", [
        id(201),
      ]),
    ).rejects.toThrow(/on Leave/);
    const failedWar = await db.query<{ status: string; count: number }>(
      "select w.status, (select count(*)::int from public.war_assignments where war_id = w.id) as count from public.wars w where w.id = $1",
      [id(201)],
    );
    expect(failedWar.rows[0]).toEqual({ status: "preparing", count: 0 });

    await db.query(
      "update public.wars set status = 'finalized' where id = $1",
      [id(202)],
    );
    const otherWar = await db.query<{ attendance_snapshot: string }>(
      "select attendance_snapshot from public.war_assignments where war_id = $1",
      [id(202)],
    );
    expect(otherWar.rows[0].attendance_snapshot).toBe("AVAILABLE");
  });

  it("freezes name, class, formation, Ultimate, and attendance independently of current data", async () => {
    await addPlayer(id(1), "Original Name", "ironclad");
    await db.query(
      "insert into public.ultimates (id, code, name, icon_storage_path) values ($1, 'shield', 'Original Ultimate', 'icons/original.svg')",
      [id(301)],
    );
    await assign(id(1), "A", 3, 2, id(301));
    await addWar(id(201));
    await db.query(
      "insert into public.war_attendance (war_id, player_id, status) values ($1, $2, 'AVAILABLE')",
      [id(201), id(1)],
    );
    await db.query(
      "update public.wars set status = 'finalized' where id = $1",
      [id(201)],
    );
    const snapshot = await db.query(
      "select player_name_snapshot, class_snapshot, party, squad_number, slot_number, ultimate_code_snapshot, ultimate_name_snapshot, ultimate_icon_path_snapshot, attendance_snapshot from public.war_assignments where war_id = $1",
      [id(201)],
    );
    expect(snapshot.rows[0]).toMatchObject({
      player_name_snapshot: "Original Name",
      class_snapshot: "ironclad",
      party: "A",
      squad_number: 3,
      slot_number: 2,
      ultimate_code_snapshot: "shield",
      ultimate_name_snapshot: "Original Ultimate",
      ultimate_icon_path_snapshot: "icons/original.svg",
      attendance_snapshot: "AVAILABLE",
    });

    await db.query(
      "update public.guild_players set display_name = 'New Name', current_class = 'sylph' where id = $1",
      [id(1)],
    );
    await db.query(
      "update public.ultimates set name = 'New Ultimate', icon_storage_path = 'icons/new.svg' where id = $1",
      [id(301)],
    );
    await db.query(
      "update public.current_formation_assignments set party = 'B', squad_number = 5, slot_number = 6 where player_id = $1",
      [id(1)],
    );
    await db.query(
      "delete from public.current_formation_assignments where player_id = $1",
      [id(1)],
    );
    await db.query(
      "update public.guild_players set archived_at = now() where id = $1",
      [id(1)],
    );
    const historicalAssignment = await db.query<{ id: string }>(
      "select id from public.war_assignments where war_id = $1",
      [id(201)],
    );
    await db.query(
      "insert into public.war_player_stats (war_assignment_id, kills) values ($1, 9)",
      [historicalAssignment.rows[0].id],
    );
    const historicalStats = await db.query<{ kills: number }>(
      "select kills from public.war_player_stats where war_assignment_id = $1",
      [historicalAssignment.rows[0].id],
    );
    expect(historicalStats.rows[0].kills).toBe(9);
    const afterChanges = await db.query(
      "select player_name_snapshot, class_snapshot, party, squad_number, slot_number, ultimate_code_snapshot, ultimate_name_snapshot, ultimate_icon_path_snapshot, attendance_snapshot from public.war_assignments where war_id = $1",
      [id(201)],
    );
    expect(afterChanges.rows).toEqual(snapshot.rows);

    await expect(
      db.query(
        "update public.war_assignments set party = 'B' where war_id = $1",
        [id(201)],
      ),
    ).rejects.toThrow(/cannot be edited/);
    await expect(
      db.query("delete from public.war_assignments where war_id = $1", [
        id(201),
      ]),
    ).rejects.toThrow(/frozen/);
    await expect(
      db.query("update public.wars set war_date = '2026-09-28' where id = $1", [
        id(201),
      ]),
    ).rejects.toThrow(/cannot be edited/);
    await expect(
      db.query("delete from public.wars where id = $1", [id(201)]),
    ).rejects.toThrow(/cannot be deleted/);
    await expect(
      db.query(
        "update public.war_attendance set status = 'LEAVE' where war_id = $1 and player_id = $2",
        [id(201), id(1)],
      ),
    ).rejects.toThrow(/preparing War/);
  });

  it("accepts official stats only for finalized participants and isolates OCR candidates", async () => {
    await addPlayer(id(1));
    await addPlayer(id(2), "Second Player");
    await assign(id(1));
    await assign(id(2), "A", 1, 2);
    await addWar(id(201));
    await db.query(
      "insert into public.war_assignments (war_id, player_id, party, squad_number, slot_number) values ($1, $2, 'A', 1, 1)",
      [id(201), id(1)],
    );
    const draftAssignment = await db.query<{ id: string }>(
      "select id from public.war_assignments where war_id = $1",
      [id(201)],
    );
    await expect(
      db.query(
        "insert into public.war_player_stats (war_assignment_id, kills) values ($1, 1)",
        [draftAssignment.rows[0].id],
      ),
    ).rejects.toThrow(/finalized War assignment/);
    await db.query(
      "update public.wars set status = 'finalized' where id = $1",
      [id(201)],
    );
    const assignments = await db.query<{ id: string }>(
      "select id from public.war_assignments where war_id = $1 order by slot_number",
      [id(201)],
    );
    const firstAssignment = assignments.rows[0].id;
    await expect(
      db.query(
        "insert into public.war_player_stats (war_assignment_id, kills) values ($1, -1)",
        [firstAssignment],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.war_player_stats (war_assignment_id, kills) values ($1, 9007199254740992)",
        [firstAssignment],
      ),
    ).rejects.toThrow();
    await db.query(
      "insert into public.war_player_stats (war_assignment_id, kills, deaths, assists) values ($1, 7, 0, 4)",
      [firstAssignment],
    );
    await db.query(
      "insert into public.war_result_uploads (id, war_id, storage_path) values ($1, $2, 'war-results/original.png')",
      [id(401), id(201)],
    );
    await db.query(
      "insert into public.war_extraction_candidates (upload_id, provider, candidate_payload) values ($1, 'fixture', $2::jsonb)",
      [id(401), JSON.stringify({ secondPlayerKills: 99 })],
    );
    await db.query(
      "insert into public.discord_player_links (player_id, discord_user_id) values ($1, '123456789012345678')",
      [id(1)],
    );
    await expect(
      db.query(
        "insert into public.discord_player_links (player_id, discord_user_id) values ($1, '123456789012345678')",
        [id(2)],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.war_extraction_candidates (upload_id, provider, candidate_payload, status, reviewed_at) values ($1, 'fixture', '{}'::jsonb, 'confirmed', now())",
        [id(401)],
      ),
    ).rejects.toThrow(/extraction_review_consistent/);
    const stats = await db.query<{ count: number }>(
      "select count(*)::int as count from public.war_player_stats",
    );
    expect(stats.rows[0].count).toBe(1);
  });

  it("keeps all protected tables closed to ordinary authenticated roles", async () => {
    const tables = await db.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(tables.rows).toHaveLength(12);
    expect(tables.rows.every(({ rowsecurity }) => rowsecurity)).toBe(true);
    const policies = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_policies where schemaname = 'public'",
    );
    expect(policies.rows[0].count).toBe(0);

    await addPlayer(id(1));
    await db.query("insert into auth.users (id) values ($1)", [id(101)]);
    await db.query(
      "insert into public.account_profiles (id, username) values ($1, 'PendingUser')",
      [id(101)],
    );
    await db.exec(
      "grant usage on schema public to authenticated; grant select, update on public.guild_players, public.account_profiles to authenticated;",
    );
    try {
      await db.exec("set role authenticated");
      const invisible = await db.query<{ count: number }>(
        "select count(*)::int as count from public.guild_players",
      );
      expect(invisible.rows[0].count).toBe(0);
      const changed = await db.query(
        "update public.guild_players set current_class = 'sylph' returning id",
      );
      expect(changed.rows).toEqual([]);
      const hiddenProfile = await db.query<{ count: number }>(
        "select count(*)::int as count from public.account_profiles",
      );
      expect(hiddenProfile.rows[0].count).toBe(0);
      const selfPromotion = await db.query(
        "update public.account_profiles set status = 'APPROVED', role = 'OWNER', decided_at = now() returning id",
      );
      expect(selfPromotion.rows).toEqual([]);
    } finally {
      await db.exec("reset role");
    }
    const profile = await db.query<{ status: string; role: string | null }>(
      "select status, role from public.account_profiles where id = $1",
      [id(101)],
    );
    expect(profile.rows[0]).toEqual({ status: "PENDING", role: null });
  });
});

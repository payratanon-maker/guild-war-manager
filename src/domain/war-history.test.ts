import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migrations = [
  "20260927000000_phase1_domain.sql",
  "20260927000001_auth_rbac.sql",
  "20260927000002_members_attendance.sql",
  "20260927000003_formation_moves.sql",
  "20260927000004_ultimate_icons.sql",
].map((name) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  ),
);
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(
    "create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb); create role authenticated; create role anon; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;",
  );
  for (const migration of migrations) await db.exec(migration);
});
afterEach(async () => {
  await db.close();
});

describe("Phase 6 War history", () => {
  it("freezes a partial formation and Ultimate after all current data changes", async () => {
    await db.query(
      "insert into public.guild_players (id,display_name,current_class) values ($1,'Old Name','ironclad')",
      [id(1)],
    );
    await db.query(
      "insert into public.ultimates (id,code,name,icon_storage_path) values ($1,'shield','Shield','shields/a.png')",
      [id(2)],
    );
    await db.query(
      "insert into public.current_formation_assignments (player_id,party,squad_number,slot_number,ultimate_id) values ($1,'A',4,2,$2)",
      [id(1), id(2)],
    );
    await db.query(
      "insert into public.wars (id,war_date) values ($1,'2026-09-27')",
      [id(3)],
    );
    await db.query(
      "insert into public.war_attendance (war_id,player_id,status) values ($1,$2,'AVAILABLE')",
      [id(3), id(1)],
    );
    await db.query("update public.wars set status='finalized' where id=$1", [
      id(3),
    ]);
    const before = await db.query(
      "select player_id,player_name_snapshot,class_snapshot,party,squad_number,slot_number,ultimate_code_snapshot,ultimate_name_snapshot,ultimate_icon_path_snapshot,attendance_snapshot from public.war_assignments where war_id=$1",
      [id(3)],
    );
    expect(before.rows).toHaveLength(1);
    await db.query(
      "update public.guild_players set display_name='New Name',current_class='sylph' where id=$1",
      [id(1)],
    );
    await db.query(
      "update public.ultimates set name='Changed',icon_storage_path='shields/b.png' where id=$1",
      [id(2)],
    );
    await db.query(
      "update public.current_formation_assignments set party='B',squad_number=5,slot_number=6,ultimate_id=null where player_id=$1",
      [id(1)],
    );
    await db.query(
      "delete from public.current_formation_assignments where player_id=$1",
      [id(1)],
    );
    await db.query(
      "update public.guild_players set archived_at=now() where id=$1",
      [id(1)],
    );
    const after = await db.query(
      "select player_id,player_name_snapshot,class_snapshot,party,squad_number,slot_number,ultimate_code_snapshot,ultimate_name_snapshot,ultimate_icon_path_snapshot,attendance_snapshot from public.war_assignments where war_id=$1",
      [id(3)],
    );
    expect(after.rows).toEqual(before.rows);
    await expect(
      db.query(
        "update public.war_assignments set player_name_snapshot='Changed' where war_id=$1",
        [id(3)],
      ),
    ).rejects.toThrow(/cannot be edited/);
  });
});

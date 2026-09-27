import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migrations = [
  "20260927000000_phase1_domain.sql",
  "20260927000001_auth_rbac.sql",
  "20260927000002_members_attendance.sql",
  "20260927000006_leave_unassign.sql",
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

describe("Phase 4 membership and attendance", () => {
  it("removes an existing placement atomically when Leave is recorded", async () => {
    await db.query(
      "insert into public.guild_players (id,display_name,current_class) values ($1,'Player','ironclad')",
      [id(1)],
    );
    await db.query(
      "insert into public.current_formation_assignments (player_id,party,squad_number,slot_number) values ($1,'A',1,1)",
      [id(1)],
    );
    await db.query(
      "insert into public.wars (id,war_date) values ($1,'2026-09-27')",
      [id(2)],
    );
    await db.query(
      "insert into public.war_attendance (war_id,player_id,status) values ($1,$2,'LEAVE')",
      [id(2), id(1)],
    );
    const rows = await db.query(
      "select player_id from public.current_formation_assignments where player_id=$1",
      [id(1)],
    );
    expect(rows.rows).toEqual([]);
    await expect(
      db.query(
        "insert into public.current_formation_assignments (player_id,party,squad_number,slot_number) values ($1,'A',1,1)",
        [id(1)],
      ),
    ).rejects.toThrow(/on Leave/);
  });
  it("scopes attendance to the War and blocks placing a player on Leave", async () => {
    await db.query(
      "insert into public.guild_players (id,display_name,current_class) values ($1,'Player','ironclad')",
      [id(1)],
    );
    await db.query(
      "insert into public.wars (id,war_date) values ($1,'2026-09-27'),($2,'2026-10-04')",
      [id(2), id(3)],
    );
    await db.query(
      "insert into public.war_attendance (war_id,player_id,status) values ($1,$3,'LEAVE'),($2,$3,'AVAILABLE')",
      [id(2), id(3), id(1)],
    );
    await expect(
      db.query(
        "insert into public.current_formation_assignments (player_id,party,squad_number,slot_number) values ($1,'A',1,1)",
        [id(1)],
      ),
    ).rejects.toThrow(/on Leave/);
    await db.query(
      "update public.war_attendance set status = 'UNKNOWN' where war_id = $1",
      [id(2)],
    );
    await db.query(
      "insert into public.current_formation_assignments (player_id,party,squad_number,slot_number) values ($1,'A',1,1)",
      [id(1)],
    );
  });
  it("preserves archive and restore contract", async () => {
    await db.query(
      "insert into public.guild_players (id,display_name,current_class) values ($1,'Player','sylph')",
      [id(1)],
    );
    await db.query(
      "update public.guild_players set archived_at = now() where id = $1",
      [id(1)],
    );
    await expect(
      db.query(
        "insert into public.current_formation_assignments (player_id,party,squad_number,slot_number) values ($1,'B',5,6)",
        [id(1)],
      ),
    ).rejects.toThrow(/archived player/);
    await db.query(
      "update public.guild_players set archived_at = null where id = $1",
      [id(1)],
    );
    await db.query(
      "insert into public.current_formation_assignments (player_id,party,squad_number,slot_number) values ($1,'B',5,6)",
      [id(1)],
    );
  });
});

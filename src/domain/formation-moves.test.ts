import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { emailForUsername } from "../lib/auth-identity";

const migrations = [
  "20260927000000_phase1_domain.sql",
  "20260927000001_auth_rbac.sql",
  "20260927000002_members_attendance.sql",
  "20260927000003_formation_moves.sql",
  "20260927000007_auth_internal_domain.sql",
  "20260927000008_auth_email_immutable.sql",
].map((name) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  ),
);
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
let db: PGlite;
async function move(
  player: number,
  party: "A" | "B" | null,
  squad: number | null = null,
  slot: number | null = null,
) {
  await db.query("select public.move_formation_player($1,$2,$3,$4)", [
    id(player),
    party,
    squad,
    slot,
  ]);
}
async function asUser<T>(n: number, run: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    id(n),
  ]);
  await db.exec("set role authenticated");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
    await db.exec("reset request.jwt.claim.sub");
  }
}
beforeEach(async () => {
  db = new PGlite();
  await db.exec(
    "create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb); create role authenticated; create role anon; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;",
  );
  for (const migration of migrations) await db.exec(migration);
  for (let n = 1; n <= 8; n++)
    await db.query(
      "insert into public.guild_players (id,display_name,current_class) values ($1,$2,'ironclad')",
      [id(n), `Player ${n}`],
    );
  for (const [n, role] of [
    [101, "MEMBER"],
    [102, "OFFICER"],
  ] as const) {
    await db.query(
      "insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3::jsonb)",
      [id(n), emailForUsername(role), JSON.stringify({ username: role })],
    );
    await db.query(
      "update public.account_profiles set status='APPROVED',role=$2::public.app_role,decided_at=now() where id=$1",
      [id(n), role],
    );
  }
});
afterEach(async () => {
  await db.close();
});

describe("Phase 5 atomic formation moves", () => {
  it("supports pool, cross-party, swap, reorder, and removal", async () => {
    await asUser(102, async () => {
      await move(1, "A", 1);
      await move(2, "B", 3);
      await move(3, "A", 1);
      await move(1, "B", 3, 1); // swap across parties
      await move(3, "B", 3, 2); // swap to occupied slot, same squad destination
      await move(2, "B", 3); // next free slot
      await move(1, null);
    });
    const rows = await db.query<{
      player_id: string;
      party: string;
      squad_number: number;
      slot_number: number;
    }>(
      "select player_id,party,squad_number,slot_number from public.current_formation_assignments order by player_id",
    );
    expect(rows.rows).toEqual([
      { player_id: id(2), party: "B", squad_number: 3, slot_number: 3 },
      { player_id: id(3), party: "B", squad_number: 3, slot_number: 2 },
    ]);
  });
  it("rejects seventh player, Leave, archived player, and member mutation without partial write", async () => {
    await asUser(102, async () => {
      for (let n = 1; n <= 6; n++) await move(n, "A", 1);
    });
    await asUser(102, async () => {
      await expect(move(7, "A", 1)).rejects.toThrow(/squad is full/);
    });
    await db.query(
      "insert into public.wars (id,war_date) values ($1,'2026-09-27')",
      [id(201)],
    );
    await db.query(
      "insert into public.war_attendance (war_id,player_id,status) values ($1,$2,'LEAVE')",
      [id(201), id(7)],
    );
    await asUser(102, async () => {
      await expect(move(7, "B", 1)).rejects.toThrow(/on Leave/);
    });
    await db.query(
      "update public.guild_players set archived_at=now() where id=$1",
      [id(8)],
    );
    await asUser(102, async () => {
      await expect(move(8, "B", 1)).rejects.toThrow(/archived/);
    });
    await asUser(101, async () => {
      await expect(move(7, "B", 1)).rejects.toThrow(/officer role required/);
    });
    const rows = await db.query<{ count: number }>(
      "select count(*)::int as count from public.current_formation_assignments",
    );
    expect(rows.rows[0].count).toBe(6);
  });
});

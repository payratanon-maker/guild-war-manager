import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { emailForUsername } from "../lib/auth-identity";

const phase1 = readFileSync(
  new URL(
    "../../supabase/migrations/20260927000000_phase1_domain.sql",
    import.meta.url,
  ),
  "utf8",
);
const phase2 = readFileSync(
  new URL(
    "../../supabase/migrations/20260927000001_auth_rbac.sql",
    import.meta.url,
  ),
  "utf8",
);
const authInternalDomain = readFileSync(
  new URL(
    "../../supabase/migrations/20260927000007_auth_internal_domain.sql",
    import.meta.url,
  ),
  "utf8",
);
const authEmailImmutable = readFileSync(
  new URL(
    "../../supabase/migrations/20260927000008_auth_email_immutable.sql",
    import.meta.url,
  ),
  "utf8",
);
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
let db: PGlite;

async function signup(n: number, username: string) {
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
    [id(n), emailForUsername(username), JSON.stringify({ username })],
  );
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
async function approve(n: number, role: string) {
  await db.query(
    "update public.account_profiles set status = 'APPROVED', role = $2::public.app_role, decided_at = now() where id = $1",
    [id(n), role],
  );
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(
    "create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb); create role authenticated; create role anon; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;",
  );
  await db.exec(phase1);
  await db.exec(phase2);
  await db.exec(authInternalDomain);
  await db.exec(authEmailImmutable);
});
afterEach(async () => {
  await db.close();
});

describe("Phase 2 Auth and database authorization", () => {
  it("provisions pending profile and blocks invalid usernames", async () => {
    await signup(1, "Alice_1");
    const profile = await db.query<{
      username: string;
      status: string;
      role: string | null;
    }>(
      "select username, status, role from public.account_profiles where id = $1",
      [id(1)],
    );
    expect(profile.rows[0]).toEqual({
      username: "Alice_1",
      status: "PENDING",
      role: null,
    });
    await expect(signup(2, "bad-name")).rejects.toThrow(
      /invalid account username/,
    );
    await expect(signup(3, "alice_1")).rejects.toThrow();
    await expect(
      db.query(
        "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
        [
          id(4),
          "legacy@users.guild-war-manager.invalid",
          JSON.stringify({ username: "legacy" }),
        ],
      ),
    ).rejects.toThrow(/invalid account username/);
    await expect(
      db.query("update auth.users set email=$2 where id=$1", [
        id(1),
        "other@users.guild-war-manager.internal",
      ]),
    ).rejects.toThrow(/internal auth email cannot be changed/);
  });

  it("keeps pending accounts from all protected data and self promotion", async () => {
    await signup(1, "Pending");
    await db.query(
      "insert into public.guild_players (id, display_name, current_class) values ($1, 'Player', 'ironclad')",
      [id(101)],
    );
    await asUser(1, async () => {
      const profile = await db.query(
        "select username from public.account_profiles",
      );
      expect(profile.rows).toEqual([{ username: "Pending" }]);
      const players = await db.query("select * from public.guild_players");
      expect(players.rows).toEqual([]);
      await expect(
        db.query(
          "insert into public.guild_players (display_name, current_class) values ('Attack', 'sylph')",
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "update public.account_profiles set role = 'OWNER', status = 'APPROVED', decided_at = now() where id = $1",
          [id(1)],
        ),
      ).rejects.toThrow();
      await expect(
        db.query("select public.decide_account($1, 'APPROVED', 'OWNER')", [
          id(1),
        ]),
      ).rejects.toThrow(/admin approval required/);
    });
  });

  it("enforces member, officer, admin, and owner boundaries", async () => {
    await signup(1, "Member");
    await signup(2, "Officer");
    await signup(3, "Admin");
    await signup(4, "Owner");
    await signup(5, "Applicant");
    await approve(1, "MEMBER");
    await approve(2, "OFFICER");
    await approve(3, "ADMIN");
    await approve(4, "OWNER");
    await asUser(1, async () => {
      await expect(
        db.query("insert into public.wars (war_date) values ('2026-09-27')"),
      ).rejects.toThrow();
      await expect(
        db.query(
          "insert into public.guild_players (display_name, current_class) values ('No', 'sylph')",
        ),
      ).rejects.toThrow();
    });
    await asUser(2, async () => {
      await db.query(
        "insert into public.wars (war_date) values ('2026-09-27')",
      );
      await expect(
        db.query(
          "insert into public.guild_players (display_name, current_class) values ('No', 'sylph')",
        ),
      ).rejects.toThrow();
      await expect(
        db.query("select public.decide_account($1, 'APPROVED', 'OWNER')", [
          id(2),
        ]),
      ).rejects.toThrow(/admin approval required/);
    });
    await asUser(3, async () => {
      await db.query(
        "insert into public.guild_players (display_name, current_class) values ('Yes', 'sylph')",
      );
      await expect(
        db.query("select public.decide_account($1, 'APPROVED', 'OWNER')", [
          id(5),
        ]),
      ).rejects.toThrow(/owner role management required/);
      await db.query("select public.decide_account($1, 'APPROVED', 'MEMBER')", [
        id(5),
      ]);
      await expect(
        db.query("select public.decide_account($1, 'APPROVED', 'OFFICER')", [
          id(3),
        ]),
      ).rejects.toThrow(/owner role management required/);
    });
    await asUser(4, async () => {
      await db.query(
        "select public.decide_account($1, 'APPROVED', 'OFFICER')",
        [id(5)],
      );
      await expect(
        db.query("select public.decide_account($1, 'APPROVED', 'MEMBER')", [
          id(4),
        ]),
      ).rejects.toThrow(/owner cannot change own role/);
    });
    const final = await db.query<{ role: string }>(
      "select role from public.account_profiles where id = $1",
      [id(5)],
    );
    expect(final.rows[0].role).toBe("OFFICER");
  });
});

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { emailForUsername } from "../lib/auth-identity";

const migrations = [
  "20260927000000_phase1_domain.sql",
  "20260927000001_auth_rbac.sql",
  "20260927000002_members_attendance.sql",
  "20260927000003_formation_moves.sql",
  "20260927000004_ultimate_icons.sql",
  "20260927000005_results_audit.sql",
  "20260927000006_leave_unassign.sql",
  "20260927000007_auth_internal_domain.sql",
  "20260927000008_auth_email_immutable.sql",
  "20260927000009_result_extraction.sql",
  "20260927000010_discord_attendance.sql",
].map((name) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  ),
);
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
let db: PGlite;
let assignmentId: string;
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
    "create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb); create role authenticated; create role anon; create role service_role; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;",
  );
  for (const migration of migrations) await db.exec(migration);
  for (const [n, role] of [
    [101, "MEMBER"],
    [102, "OFFICER"],
    [103, "ADMIN"],
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
  await db.query("update public.wars set status='finalized' where id=$1", [
    id(2),
  ]);
  assignmentId = (
    await db.query<{ id: string }>(
      "select id from public.war_assignments where war_id=$1",
      [id(2)],
    )
  ).rows[0].id;
});
afterEach(async () => {
  await db.close();
});

async function asDiscordService<T>(run: () => Promise<T>) {
  await db.query(
    "select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)",
  );
  await db.exec("set role service_role");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
    await db.exec("reset request.jwt.claims");
  }
}

describe("Phase 7 official result authorization", () => {
  it("rejects Member writes, accepts Officer writes, and stamps the true editor", async () => {
    await asUser(101, async () => {
      await expect(
        db.query(
          "insert into public.war_player_stats (war_assignment_id,kills) values ($1,5)",
          [assignmentId],
        ),
      ).rejects.toThrow();
    });
    await asUser(102, async () => {
      await db.query(
        "insert into public.war_player_stats (war_assignment_id,kills,deaths,assists,entered_by) values ($1,5,0,3,$2)",
        [assignmentId, id(101)],
      );
    });
    const row = await db.query<{ kills: number; entered_by: string }>(
      "select kills,entered_by from public.war_player_stats where war_assignment_id=$1",
      [assignmentId],
    );
    expect(row.rows[0]).toEqual({ kills: 5, entered_by: id(102) });
    await asUser(101, async () => {
      const denied = await db.query(
        "update public.war_player_stats set kills=99 where war_assignment_id=$1 returning war_assignment_id",
        [assignmentId],
      );
      expect(denied.rows).toEqual([]);
    });
    await asUser(102, async () => {
      await expect(
        db.query(
          "update public.war_player_stats set kills=-1 where war_assignment_id=$1",
          [assignmentId],
        ),
      ).rejects.toThrow();
      await db.query(
        "update public.war_player_stats set kills=7 where war_assignment_id=$1",
        [assignmentId],
      );
    });
    const updated = await db.query<{ kills: number }>(
      "select kills from public.war_player_stats where war_assignment_id=$1",
      [assignmentId],
    );
    expect(updated.rows[0].kills).toBe(7);
  });
});

describe("Phase 9 OCR candidate confirmation boundary", () => {
  it("keeps OCR candidates nonofficial until an Officer confirms reviewed values", async () => {
    const uploadId = id(600);
    const candidateId = id(601);
    await db.query(
      "insert into public.war_result_uploads (id,war_id,storage_path) values ($1,$2,'war-results/source.png')",
      [uploadId, id(2)],
    );
    await db.query(
      "insert into public.war_extraction_candidates (id,upload_id,provider,candidate_payload) values ($1,$2,'fixture',$3::jsonb)",
      [candidateId, uploadId, JSON.stringify({ records: [] })],
    );
    await asUser(102, async () => {
      await expect(
        db.query("select public.confirm_extraction_candidate($1)", [
          candidateId,
        ]),
      ).rejects.toThrow(/must be reviewed/);
    });
    const beforeReview = await db.query<{ count: number }>(
      "select count(*)::int as count from public.war_player_stats",
    );
    expect(beforeReview.rows[0].count).toBe(0);
    const reviewed = {
      records: [
        {
          assignmentId,
          playerName: "Corrected Player",
          stats: {
            kills: 8,
            deaths: 0,
            assists: 4,
            damage: 900,
            healing: 20,
            damageTaken: 300,
            towerDamage: 10,
            revives: null,
          },
        },
      ],
    };
    await asUser(101, async () => {
      await expect(
        db.query("select public.review_extraction_candidate($1,$2::jsonb)", [
          candidateId,
          JSON.stringify(reviewed),
        ]),
      ).rejects.toThrow(/42501|officer role required/);
    });
    await asUser(102, async () => {
      await db.query(
        "select public.review_extraction_candidate($1,$2::jsonb)",
        [candidateId, JSON.stringify(reviewed)],
      );
    });
    const afterReview = await db.query<{ count: number }>(
      "select count(*)::int as count from public.war_player_stats",
    );
    expect(afterReview.rows[0].count).toBe(0);
    await asUser(102, async () => {
      await db.query("select public.confirm_extraction_candidate($1)", [
        candidateId,
      ]);
    });
    const official = await db.query<{
      kills: number;
      deaths: number;
      entered_by: string;
    }>(
      "select kills,deaths,entered_by from public.war_player_stats where war_assignment_id=$1",
      [assignmentId],
    );
    expect(official.rows[0]).toEqual({
      kills: 8,
      deaths: 0,
      entered_by: id(102),
    });
    const confirmed = await db.query<{ status: string }>(
      "select status from public.war_extraction_candidates where id=$1",
      [candidateId],
    );
    expect(confirmed.rows[0].status).toBe("confirmed");
  });

  it("rejects duplicate or cross-War assignment targets atomically", async () => {
    const uploadId = id(610);
    const candidateId = id(611);
    await db.query(
      "insert into public.war_result_uploads (id,war_id,storage_path) values ($1,$2,'war-results/invalid.png')",
      [uploadId, id(2)],
    );
    const row = {
      assignmentId,
      stats: {
        kills: 1,
        deaths: 1,
        assists: 1,
        damage: 1,
        healing: 1,
        damageTaken: 1,
        towerDamage: 1,
        revives: null,
      },
    };
    await db.query(
      "insert into public.war_extraction_candidates (id,upload_id,provider,candidate_payload) values ($1,$2,'fixture',$3::jsonb)",
      [candidateId, uploadId, JSON.stringify({ records: [row, row] })],
    );
    await asUser(102, async () => {
      await db.query(
        "update public.war_extraction_candidates set status='reviewed',reviewed_by=$2,reviewed_at=now() where id=$1",
        [candidateId, id(102)],
      );
      await expect(
        db.query("select public.confirm_extraction_candidate($1)", [
          candidateId,
        ]),
      ).rejects.toThrow(/duplicate assignment/);
    });
    const results = await db.query<{ count: number }>(
      "select count(*)::int as count from public.war_player_stats",
    );
    expect(results.rows[0].count).toBe(0);
  });

  it("rolls back all official writes if one candidate references another War", async () => {
    await db.query(
      "insert into public.wars (id,war_date) values ($1,'2026-09-28')",
      [id(620)],
    );
    await db.query("update public.wars set status='finalized' where id=$1", [
      id(620),
    ]);
    const otherAssignmentId = (
      await db.query<{ id: string }>(
        "select id from public.war_assignments where war_id=$1",
        [id(620)],
      )
    ).rows[0].id;
    const uploadId = id(621);
    const candidateId = id(622);
    const stats = {
      kills: 1,
      deaths: 0,
      assists: 0,
      damage: 1,
      healing: 0,
      damageTaken: 0,
      towerDamage: 0,
      revives: null,
    };
    await db.query(
      "insert into public.war_result_uploads (id,war_id,storage_path) values ($1,$2,'war-results/cross-war.png')",
      [uploadId, id(2)],
    );
    await db.query(
      "insert into public.war_extraction_candidates (id,upload_id,provider,candidate_payload) values ($1,$2,'fixture',$3::jsonb)",
      [
        candidateId,
        uploadId,
        JSON.stringify({
          records: [
            { assignmentId, stats },
            { assignmentId: otherAssignmentId, stats },
          ],
        }),
      ],
    );
    await asUser(102, async () => {
      await db.query(
        "update public.war_extraction_candidates set status='reviewed',reviewed_by=$2,reviewed_at=now() where id=$1",
        [candidateId, id(102)],
      );
      await expect(
        db.query("select public.confirm_extraction_candidate($1)", [
          candidateId,
        ]),
      ).rejects.toThrow(/assignment does not belong/);
    });
    const results = await db.query<{ count: number }>(
      "select count(*)::int as count from public.war_player_stats",
    );
    expect(results.rows[0].count).toBe(0);
  });
});

describe("Phase 10 Discord attendance boundary", () => {
  it("keeps privileged RPC execution scoped to the intended Supabase roles", async () => {
    const privileges = await db.query<{
      anon_confirm: boolean;
      member_confirm: boolean;
      member_discord: boolean;
      service_discord: boolean;
      definer: boolean;
      config: string[] | null;
    }>(
      "select has_function_privilege('anon', 'public.confirm_extraction_candidate(uuid)', 'execute') as anon_confirm, " +
        "has_function_privilege('authenticated', 'public.confirm_extraction_candidate(uuid)', 'execute') as member_confirm, " +
        "has_function_privilege('authenticated', 'public.discord_set_attendance(text,public.attendance_status,uuid)', 'execute') as member_discord, " +
        "has_function_privilege('service_role', 'public.discord_set_attendance(text,public.attendance_status,uuid)', 'execute') as service_discord, " +
        "p.prosecdef as definer, p.proconfig as config from pg_proc p join pg_namespace n on n.oid=p.pronamespace " +
        "where n.nspname='public' and p.proname='discord_set_attendance'",
    );
    expect(privileges.rows[0]).toMatchObject({
      anon_confirm: false,
      member_confirm: true,
      member_discord: false,
      service_discord: true,
      definer: true,
    });
    expect(privileges.rows[0].config?.join(",")).toContain('search_path=""');
  });

  it("accepts idempotent mapped attendance, unassigns on Leave, and rejects archived or unknown users", async () => {
    await asUser(102, async () => {
      await expect(
        db.query(
          "insert into public.discord_player_links (player_id,discord_user_id) values ($1,'123456789012345678')",
          [id(1)],
        ),
      ).rejects.toThrow();
    });
    await asUser(103, async () => {
      await db.query(
        "insert into public.discord_player_links (player_id,discord_user_id) values ($1,'123456789012345678')",
        [id(1)],
      );
    });
    await db.query(
      "insert into public.wars (id,war_date) values ($1,'2026-09-29')",
      [id(630)],
    );
    await asDiscordService(async () => {
      await expect(
        db.query(
          "select public.discord_set_attendance('123456789012345678','AVAILABLE',$1)",
          [id(2)],
        ),
      ).rejects.toThrow(/no matching War/);
    });
    await expect(
      db.query(
        "select public.discord_set_attendance('123456789012345678','AVAILABLE',$1)",
        [id(630)],
      ),
    ).rejects.toThrow(/service role required/);
    await asDiscordService(async () => {
      await db.query(
        "select public.discord_set_attendance('123456789012345678','AVAILABLE',$1)",
        [id(630)],
      );
      await db.query(
        "select public.discord_set_attendance('123456789012345678','AVAILABLE')",
      );
    });
    const joined = await db.query<{ count: number }>(
      "select count(*)::int as count from public.war_attendance where war_id=$1 and player_id=$2 and status='AVAILABLE'",
      [id(630), id(1)],
    );
    expect(joined.rows[0].count).toBe(1);
    await asDiscordService(async () => {
      await db.query(
        "select public.discord_set_attendance('123456789012345678','LEAVE',$1)",
        [id(630)],
      );
      await db.query(
        "select public.discord_set_attendance('123456789012345678','LEAVE',$1)",
        [id(630)],
      );
      await expect(
        db.query(
          "select public.discord_set_attendance('999999999999999999','LEAVE')",
        ),
      ).rejects.toThrow(/not linked/);
    });
    const unassigned = await db.query<{ count: number }>(
      "select count(*)::int as count from public.current_formation_assignments where player_id=$1",
      [id(1)],
    );
    expect(unassigned.rows[0].count).toBe(0);
    await db.query(
      "update public.guild_players set archived_at=now() where id=$1",
      [id(1)],
    );
    await expect(
      db.query(
        "update public.discord_player_links set player_id=$1 where discord_user_id='123456789012345678'",
        [id(1)],
      ),
    ).rejects.toThrow(/active Guild Player/);
    await asDiscordService(async () => {
      await expect(
        db.query(
          "select public.discord_set_attendance('123456789012345678','AVAILABLE',$1)",
          [id(630)],
        ),
      ).rejects.toThrow(/archived/);
    });
  });
});

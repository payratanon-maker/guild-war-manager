import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { GuildClassId } from "@/lib/guild-classes";
import type { Party } from "@/domain/model";
import type { RawStats, ResultRecord, WarRecord } from "@/domain/statistics";

async function allPages<T>(
  load: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function loadStatisticsData(): Promise<{
  wars: WarRecord[];
  records: ResultRecord[];
}> {
  const supabase = await createClient();
  const warsRows = await allPages(async (from, to) =>
    supabase
      .from("wars")
      .select("id,war_number,war_date")
      .eq("status", "finalized")
      .order("war_number", { ascending: false })
      .range(from, to),
  );
  const wars: WarRecord[] = warsRows.map((war) => ({
    id: war.id,
    warNumber: Number(war.war_number),
    warDate: war.war_date,
  }));
  if (!wars.length) return { wars, records: [] };
  const [assignments, stats, players] = await Promise.all([
    allPages(async (from, to) =>
      supabase
        .from("war_assignments")
        .select(
          "id,war_id,player_id,player_name_snapshot,class_snapshot,party,squad_number",
        )
        .order("id")
        .range(from, to),
    ),
    allPages(async (from, to) =>
      supabase
        .from("war_player_stats")
        .select(
          "war_assignment_id,kills,deaths,assists,damage,healing,damage_taken,tower_damage,revives",
        )
        .order("war_assignment_id")
        .range(from, to),
    ),
    allPages(async (from, to) =>
      supabase
        .from("guild_players")
        .select("id,archived_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  const warById = new Map(wars.map((war) => [war.id, war]));
  const statByAssignment = new Map(
    stats.map((row) => [row.war_assignment_id, row]),
  );
  const archivedByPlayer = new Map(
    players.map((player) => [player.id, !!player.archived_at]),
  );
  const records: ResultRecord[] = assignments.flatMap((assignment) => {
    const war = warById.get(assignment.war_id);
    if (!war) return [];
    const stat = statByAssignment.get(assignment.id);
    const raw: RawStats | null = stat
      ? {
          kills: Number(stat.kills),
          deaths: Number(stat.deaths),
          assists: Number(stat.assists),
          damage: Number(stat.damage),
          healing: Number(stat.healing),
          damageTaken: Number(stat.damage_taken),
          towerDamage: Number(stat.tower_damage),
          revives: Number(stat.revives ?? 0),
        }
      : null;
    return [
      {
        warId: war.id,
        warNumber: war.warNumber,
        playerId: assignment.player_id,
        playerName: assignment.player_name_snapshot,
        classSnapshot: assignment.class_snapshot as GuildClassId,
        party: assignment.party as Party,
        squadNumber: assignment.squad_number,
        archived: archivedByPlayer.get(assignment.player_id) ?? true,
        stats: raw,
      },
    ];
  });
  return { wars, records };
}

import type { GuildClassId } from "@/lib/guild-classes";
import type { Party } from "./model";

export type StatField =
  | "kills"
  | "deaths"
  | "assists"
  | "damage"
  | "healing"
  | "damageTaken"
  | "towerDamage"
  | "revives";
export const statFields: readonly StatField[] = [
  "kills",
  "deaths",
  "assists",
  "damage",
  "healing",
  "damageTaken",
  "towerDamage",
  "revives",
];
export type RawStats = Record<StatField, number>;
export type Period = "THIS_WAR" | "LAST_5" | "ALL_TIME";
export type LeaderboardField =
  | "kills"
  | "assists"
  | "damage"
  | "healing"
  | "damageTaken"
  | "towerDamage"
  | "kda";
export const leaderboardFields: readonly LeaderboardField[] = [
  "kills",
  "assists",
  "damage",
  "healing",
  "damageTaken",
  "towerDamage",
  "kda",
];
export interface WarRecord {
  id: string;
  warNumber: number;
  warDate: string;
}
export interface ResultRecord {
  warId: string;
  warNumber: number;
  playerId: string;
  playerName: string;
  classSnapshot: GuildClassId;
  party: Party;
  squadNumber: number;
  archived: boolean;
  stats: RawStats | null;
}
export interface PlayerAggregate extends RawStats {
  playerId: string;
  playerName: string;
  classSnapshot: GuildClassId;
  archived: boolean;
  wars: number;
  recordedWars: number;
  kda: number;
  latestWarNumber: number;
}
export interface StatisticsFilters {
  period: Period;
  warId?: string;
  classId?: GuildClassId;
  party?: Party;
  membership?: "active" | "all";
}
export interface StatisticsResult {
  warIds: string[];
  players: PlayerAggregate[];
  leaderboards: Record<LeaderboardField, PlayerAggregate[]>;
}

export function calculateKda(kills: number, deaths: number, assists: number) {
  return (kills + assists) / Math.max(deaths, 1);
}
const zeroStats = (): RawStats => ({
  kills: 0,
  deaths: 0,
  assists: 0,
  damage: 0,
  healing: 0,
  damageTaken: 0,
  towerDamage: 0,
  revives: 0,
});
function safeAdd(a: number, b: number) {
  const sum = a + b;
  if (!Number.isSafeInteger(sum))
    throw new Error("Statistic total exceeds JavaScript safe integer range");
  return sum;
}

export function aggregateStatistics(
  wars: WarRecord[],
  records: ResultRecord[],
  filters: StatisticsFilters,
): StatisticsResult {
  const newest = [...wars].sort((a, b) => b.warNumber - a.warNumber);
  const selected =
    filters.period === "THIS_WAR"
      ? newest
          .filter((war) => war.id === (filters.warId ?? newest[0]?.id))
          .slice(0, 1)
      : filters.period === "LAST_5"
        ? newest.slice(0, 5)
        : newest;
  const warIds = new Set(selected.map((war) => war.id));
  const filtered = records.filter(
    (row) =>
      warIds.has(row.warId) &&
      (!filters.classId || row.classSnapshot === filters.classId) &&
      (!filters.party || row.party === filters.party) &&
      (filters.membership !== "active" || !row.archived),
  );
  const byPlayer = new Map<string, PlayerAggregate>();
  for (const row of filtered) {
    let aggregate = byPlayer.get(row.playerId);
    if (!aggregate) {
      aggregate = {
        playerId: row.playerId,
        playerName: row.playerName,
        classSnapshot: row.classSnapshot,
        archived: row.archived,
        wars: 0,
        recordedWars: 0,
        kda: 0,
        latestWarNumber: 0,
        ...zeroStats(),
      };
      byPlayer.set(row.playerId, aggregate);
    }
    aggregate.wars++;
    if (row.warNumber >= aggregate.latestWarNumber) {
      aggregate.latestWarNumber = row.warNumber;
      aggregate.playerName = row.playerName;
      aggregate.classSnapshot = row.classSnapshot;
      aggregate.archived = row.archived;
    }
    if (row.stats) {
      aggregate.recordedWars++;
      for (const field of statFields)
        aggregate[field] = safeAdd(aggregate[field], row.stats[field]);
    }
  }
  const players = [...byPlayer.values()].map((player) => ({
    ...player,
    kda: calculateKda(player.kills, player.deaths, player.assists),
  }));
  players.sort(
    (a, b) =>
      a.playerName.localeCompare(b.playerName) ||
      a.playerId.localeCompare(b.playerId),
  );
  const leaderboards = Object.fromEntries(
    leaderboardFields.map((field) => [
      field,
      players
        .filter((player) => player.recordedWars > 0)
        .sort(
          (a, b) =>
            b[field] - a[field] ||
            a.playerName.localeCompare(b.playerName) ||
            a.playerId.localeCompare(b.playerId),
        )
        .slice(0, 10),
    ]),
  ) as Record<LeaderboardField, PlayerAggregate[]>;
  return { warIds: selected.map((war) => war.id), players, leaderboards };
}

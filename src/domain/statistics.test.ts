import { describe, expect, it } from "vitest";
import {
  aggregateStatistics,
  calculateKda,
  type ResultRecord,
  type WarRecord,
} from "./statistics";

const wars: WarRecord[] = Array.from({ length: 6 }, (_, i) => ({
  id: `war${i + 1}`,
  warNumber: i + 1,
  warDate: `2026-09-${String(i + 1).padStart(2, "0")}`,
}));
const stats = (kills: number, deaths: number, assists: number) => ({
  kills,
  deaths,
  assists,
  damage: kills * 100,
  healing: assists * 100,
  damageTaken: deaths * 100,
  towerDamage: kills * 10,
  revives: 0,
});
const record = (
  warNumber: number,
  playerId: string,
  playerName: string,
  options?: Partial<ResultRecord>,
): ResultRecord => ({
  warId: `war${warNumber}`,
  warNumber,
  playerId,
  playerName,
  classSnapshot: "ironclad",
  party: "A",
  squadNumber: 1,
  archived: false,
  stats: stats(1, 1, 0),
  ...options,
});
const records = [
  record(1, "a", "Alpha", { stats: stats(10, 0, 0), classSnapshot: "sylph" }),
  record(1, "b", "Beta", {
    stats: stats(2, 1, 15),
    party: "B",
    archived: true,
  }),
  record(2, "a", "Alpha", { stats: stats(1, 1, 0) }),
  record(2, "b", "Beta", {
    stats: stats(1, 1, 12),
    party: "B",
    archived: true,
  }),
  record(3, "a", "Alpha", { stats: stats(1, 1, 0) }),
  record(4, "a", "Alpha", { stats: stats(1, 1, 0) }),
  record(5, "a", "Alpha", { stats: stats(1, 1, 0) }),
  record(6, "a", "Alpha", { stats: stats(5, 0, 5) }),
  record(6, "c", "Charlie", { stats: stats(5, 0, 5) }),
  record(6, "d", "Delta", { stats: null }),
];

describe("Phase 7 canonical statistics", () => {
  it("works at War #1 and uses zero-death denominator of one", () => {
    const result = aggregateStatistics(wars.slice(0, 1), records, {
      period: "THIS_WAR",
    });
    expect(result.warIds).toEqual(["war1"]);
    expect(result.players.find((p) => p.playerId === "a")?.kda).toBe(10);
    expect(calculateKda(7, 0, 4)).toBe(11);
    expect(result.leaderboards.assists[0].playerId).toBe("b");
  });
  it("uses latest five Wars rather than all time", () => {
    const lastFive = aggregateStatistics(wars, records, { period: "LAST_5" });
    const all = aggregateStatistics(wars, records, { period: "ALL_TIME" });
    expect(lastFive.warIds).toEqual(["war6", "war5", "war4", "war3", "war2"]);
    expect(lastFive.players.find((p) => p.playerId === "a")?.kills).toBe(9);
    expect(all.players.find((p) => p.playerId === "a")?.kills).toBe(19);
    expect(all.players.find((p) => p.playerId === "a")?.wars).toBe(6);
  });
  it("uses deterministic ties, excludes unrecorded rows from leaderboards, and ranks Top Assists", () => {
    const result = aggregateStatistics(wars, records, { period: "THIS_WAR" });
    expect(result.leaderboards.kills.map((p) => p.playerId)).toEqual([
      "a",
      "c",
    ]);
    expect(result.leaderboards.assists.map((p) => p.playerId)).toEqual([
      "a",
      "c",
    ]);
    expect(result.players.find((p) => p.playerId === "d")?.wars).toBe(1);
    expect(result.players.find((p) => p.playerId === "d")?.recordedWars).toBe(
      0,
    );
    const warOne = aggregateStatistics(wars, records, {
      period: "THIS_WAR",
      warId: "war1",
    });
    expect(warOne.leaderboards.damage[0].playerId).toBe("a");
    expect(warOne.leaderboards.healing[0].playerId).toBe("b");
    expect(warOne.leaderboards.damageTaken[0].playerId).toBe("b");
    expect(warOne.leaderboards.towerDamage[0].playerId).toBe("a");
    expect(warOne.leaderboards.kda[0].playerId).toBe("b");
  });
  it("retains former members, filters historical class snapshot and party", () => {
    const all = aggregateStatistics(wars, records, { period: "ALL_TIME" });
    expect(all.players.find((p) => p.playerId === "b")?.archived).toBe(true);
    const active = aggregateStatistics(wars, records, {
      period: "ALL_TIME",
      membership: "active",
    });
    expect(active.players.some((p) => p.playerId === "b")).toBe(false);
    const sylph = aggregateStatistics(wars, records, {
      period: "ALL_TIME",
      classId: "sylph",
    });
    expect(sylph.players.map((p) => [p.playerId, p.wars])).toEqual([["a", 1]]);
    const partyB = aggregateStatistics(wars, records, {
      period: "ALL_TIME",
      party: "B",
    });
    expect(partyB.players.map((p) => [p.playerId, p.wars])).toEqual([["b", 2]]);
  });
});

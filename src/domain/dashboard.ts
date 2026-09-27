import { guildClasses, type GuildClassId } from "../lib/guild-classes";
import type { Party } from "./model";

export interface DashboardPlayer {
  id: string;
  current_class: GuildClassId;
  archived_at: string | null;
}

export interface DashboardAssignment {
  player_id: string;
  party: Party;
  squad_number: number;
}

export interface DashboardAttendance {
  player_id: string;
  status: "UNKNOWN" | "AVAILABLE" | "LEAVE";
}

export function summarizeDashboard(
  players: DashboardPlayer[],
  assignments: DashboardAssignment[],
  attendance: DashboardAttendance[],
) {
  const active = players.filter((player) => !player.archived_at);
  const activeIds = new Set(active.map((player) => player.id));
  const activeAttendance = attendance.filter((row) =>
    activeIds.has(row.player_id),
  );
  const leave = new Set(
    activeAttendance
      .filter((row) => row.status === "LEAVE")
      .map((row) => row.player_id),
  );
  const eligibleAssignments = assignments.filter(
    (row) => !leave.has(row.player_id),
  );
  const classSummary = guildClasses.map((item) => {
    const count = active.filter(
      (player) => player.current_class === item.id,
    ).length;
    return {
      id: item.id,
      count,
      percentage: active.length ? Math.round((count / active.length) * 100) : 0,
    };
  });
  const squads = (["A", "B"] as const).flatMap((party) =>
    [1, 2, 3, 4, 5].map((squadNumber) => ({
      party,
      squadNumber,
      count: assignments.filter(
        (row) => row.party === party && row.squad_number === squadNumber,
      ).length,
    })),
  );
  return {
    activeCount: active.length,
    availableCount: activeAttendance.filter((row) => row.status === "AVAILABLE")
      .length,
    leaveCount: activeAttendance.filter((row) => row.status === "LEAVE").length,
    assignedCount: eligibleAssignments.length,
    unassignedCount: Math.max(0, active.length - eligibleAssignments.length),
    partyACount: eligibleAssignments.filter((row) => row.party === "A").length,
    partyBCount: eligibleAssignments.filter((row) => row.party === "B").length,
    classSummary,
    squads,
  };
}

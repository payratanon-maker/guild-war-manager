import { describe, expect, it } from "vitest";
import { summarizeDashboard } from "./dashboard";

describe("dashboard summary", () => {
  it("excludes archived members and Leave players from available formation counts", () => {
    const summary = summarizeDashboard(
      [
        { id: "a", current_class: "ironclad", archived_at: null },
        { id: "b", current_class: "sylph", archived_at: null },
        { id: "c", current_class: "sylph", archived_at: "2026-01-01" },
      ],
      [
        { player_id: "a", party: "A", squad_number: 1 },
        { player_id: "b", party: "B", squad_number: 2 },
      ],
      [
        { player_id: "a", status: "AVAILABLE" },
        { player_id: "b", status: "LEAVE" },
        { player_id: "c", status: "LEAVE" },
      ],
    );
    expect(summary).toMatchObject({
      activeCount: 2,
      availableCount: 1,
      leaveCount: 1,
      assignedCount: 1,
      unassignedCount: 1,
      partyACount: 1,
      partyBCount: 0,
    });
    expect(summary.classSummary.find((row) => row.id === "ironclad")).toEqual({
      id: "ironclad",
      count: 1,
      percentage: 50,
    });
    expect(summary.squads).toHaveLength(10);
    expect(
      summary.squads.find((row) => row.party === "A" && row.squadNumber === 1)
        ?.count,
    ).toBe(1);
  });

  it("returns zero percentages for an empty roster", () => {
    expect(
      summarizeDashboard([], [], []).classSummary.every(
        (row) => row.percentage === 0,
      ),
    ).toBe(true);
  });

  it("excludes archived players from current attendance counts", () => {
    const summary = summarizeDashboard(
      [
        { id: "active", current_class: "ironclad", archived_at: null },
        { id: "archived", current_class: "sylph", archived_at: "2026-01-01" },
      ],
      [],
      [
        { player_id: "active", status: "AVAILABLE" },
        { player_id: "archived", status: "LEAVE" },
      ],
    );

    expect(summary.availableCount).toBe(1);
    expect(summary.leaveCount).toBe(0);
  });
});

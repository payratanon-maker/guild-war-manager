export const extractionStatFields = [
  "kills",
  "deaths",
  "assists",
  "damage",
  "healing",
  "damageTaken",
  "towerDamage",
  "revives",
] as const;

export type ExtractionStatField = (typeof extractionStatFields)[number];
export type ReviewedExtractionRow = {
  assignmentId: string | null;
  playerName: string;
  confidence: number | null;
} & Record<ExtractionStatField, string>;

export const blankExtractionRow = (): ReviewedExtractionRow => ({
  assignmentId: null,
  playerName: "",
  confidence: null,
  kills: "",
  deaths: "",
  assists: "",
  damage: "",
  healing: "",
  damageTaken: "",
  towerDamage: "",
  revives: "",
});

export function readCandidateRows(payload: unknown): ReviewedExtractionRow[] {
  if (!payload || typeof payload !== "object" || !("records" in payload))
    return [];
  const records = (payload as { records?: unknown }).records;
  if (!Array.isArray(records)) return [];
  return records.map((value) => {
    const row = value && typeof value === "object" ? value : {};
    const stats =
      "stats" in row && row.stats && typeof row.stats === "object"
        ? (row.stats as Record<string, unknown>)
        : {};
    const output = blankExtractionRow();
    output.assignmentId =
      typeof row.assignmentId === "string" ? row.assignmentId : null;
    output.playerName =
      typeof row.playerName === "string" ? row.playerName : "";
    output.confidence =
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.max(0, Math.min(1, row.confidence))
        : null;
    for (const field of extractionStatFields) {
      const value = stats[field];
      output[field] =
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0
          ? String(value)
          : "";
    }
    return output;
  });
}

export function parseReviewedRows(input: string): {
  assignmentId: string;
  playerName: string;
  confidence: number | null;
  stats: Record<ExtractionStatField, number | null>;
}[] {
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    throw new Error("Invalid candidate review data");
  }
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 36) {
    throw new Error("At least one and at most 36 player results are required");
  }
  const assignmentIds = new Set<string>();
  return rows.map((value) => {
    if (!value || typeof value !== "object")
      throw new Error("Invalid result row");
    const row = value as Record<string, unknown>;
    const assignmentId = String(row.assignmentId ?? "");
    if (
      !/^[0-9a-f-]{36}$/i.test(assignmentId) ||
      assignmentIds.has(assignmentId)
    ) {
      throw new Error("Each result must map to a unique War participant");
    }
    assignmentIds.add(assignmentId);
    const stats = {} as Record<ExtractionStatField, number | null>;
    for (const field of extractionStatFields) {
      const raw = String(row[field] ?? "").trim();
      if (field === "revives" && !raw) {
        stats[field] = null;
        continue;
      }
      if (!/^(0|[1-9]\d*)$/.test(raw))
        throw new Error("Statistics must be nonnegative integers");
      const number = Number(raw);
      if (!Number.isSafeInteger(number))
        throw new Error("Statistic exceeds the supported integer range");
      stats[field] = number;
    }
    const playerName = String(row.playerName ?? "").trim();
    if (playerName.length > 100) throw new Error("Player name is too long");
    const confidence =
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.max(0, Math.min(1, row.confidence))
        : null;
    return { assignmentId, playerName, confidence, stats };
  });
}

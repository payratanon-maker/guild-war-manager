import Link from "next/link";
import { Shell } from "@/components/shell";
import { ClassBadge, EmptyState, ErrorState } from "@/components/ui";
import { can, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocale, translate } from "@/lib/i18n";
import type { GuildClassId } from "@/lib/guild-classes";
import { calculateKda } from "@/domain/statistics";
import { saveWarResult } from "./actions";

export const dynamic = "force-dynamic";
export default async function Results({
  searchParams,
}: {
  searchParams: Promise<{ war?: string; error?: string }>;
}) {
  const account = await requireRole();
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const { war: requestedWar, error } = await searchParams;
  const supabase = await createClient();
  const { data: wars, error: warsError } = await supabase
    .from("wars")
    .select("id,war_number,war_date")
    .eq("status", "finalized")
    .order("war_number", { ascending: false })
    .limit(100);
  const requestedResult =
    requestedWar &&
    /^[0-9a-f-]{36}$/i.test(requestedWar) &&
    !wars?.some((war) => war.id === requestedWar)
      ? await supabase
          .from("wars")
          .select("id,war_number,war_date")
          .eq("id", requestedWar)
          .eq("status", "finalized")
          .maybeSingle()
      : { data: null, error: null };
  const requested = requestedResult.data;
  const options = requested ? [requested, ...(wars ?? [])] : (wars ?? []);
  const selectedWar =
    options.find((war) => war.id === requestedWar) ?? options[0];
  const assignmentsResult = selectedWar
    ? await supabase
        .from("war_assignments")
        .select(
          "id,player_name_snapshot,class_snapshot,party,squad_number,slot_number",
        )
        .eq("war_id", selectedWar.id)
        .order("party")
        .order("squad_number")
        .order("slot_number")
    : { data: null, error: null };
  const assignments = assignmentsResult.data;
  const statsResult = assignments?.length
    ? await supabase
        .from("war_player_stats")
        .select(
          "war_assignment_id,kills,deaths,assists,damage,healing,damage_taken,tower_damage,revives",
        )
        .in(
          "war_assignment_id",
          assignments.map((a) => a.id),
        )
    : { data: null, error: null };
  const stats = statsResult.data;
  const queryFailed = !!(
    warsError ||
    requestedResult.error ||
    assignmentsResult.error ||
    statsResult.error
  );
  const byId = new Map(stats?.map((row) => [row.war_assignment_id, row]));
  const fields = [
    "kills",
    "deaths",
    "assists",
    "damage",
    "healing",
    "damage_taken",
    "tower_damage",
    "revives",
  ] as const;
  const labels = [
    "kills",
    "deaths",
    "assists",
    "damage",
    "healing",
    "damageTaken",
    "towerDamage",
    "revives",
  ] as const;
  return (
    <Shell account={account} title="results">
      {error && <ErrorState>{t("error")}</ErrorState>}
      {queryFailed && <ErrorState>{t("error")}</ErrorState>}
      <div className="toolbar">
        {queryFailed ? null : options.length ? (
          <form>
            <label>
              {t("warNumber")}
              <select name="war" defaultValue={selectedWar?.id}>
                {options.map((war) => (
                  <option key={war.id} value={war.id}>
                    #{war.war_number} · {war.war_date}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button">{t("filters")}</button>
          </form>
        ) : (
          <EmptyState>{t("empty")}</EmptyState>
        )}
        {selectedWar && (
          <Link className="text-button" href={`/history/${selectedWar.id}`}>
            {t("history")} →
          </Link>
        )}
        {can(account.role, "OFFICER") && (
          <Link className="text-button" href="/results/extraction">
            {t("ocr")} →
          </Link>
        )}
      </div>
      {selectedWar && !queryFailed && (
        <section className="panel">
          <h2>
            {t("warNumber")} #{selectedWar.war_number}
          </h2>
          {!assignments?.length ? (
            <EmptyState>{t("empty")}</EmptyState>
          ) : (
            <div className="result-list">
              {assignments.map((assignment) => {
                const row = byId.get(assignment.id);
                return (
                  <div key={assignment.id} className="result-row">
                    <div className="result-identity">
                      <strong>{assignment.player_name_snapshot}</strong>
                      <ClassBadge
                        classId={assignment.class_snapshot as GuildClassId}
                      />
                      <span>
                        {assignment.party}
                        {assignment.squad_number} · {assignment.slot_number}
                      </span>
                    </div>
                    {can(account.role, "OFFICER") ? (
                      <form action={saveWarResult} className="result-form">
                        <input
                          type="hidden"
                          name="warId"
                          value={selectedWar.id}
                        />
                        <input
                          type="hidden"
                          name="assignmentId"
                          value={assignment.id}
                        />
                        {fields.map((field, index) => (
                          <label key={field}>
                            {t(labels[index])}
                            <input
                              type="number"
                              name={field}
                              min={0}
                              max={Number.MAX_SAFE_INTEGER}
                              step={1}
                              defaultValue={
                                row
                                  ? (row[field] ?? "")
                                  : field === "revives"
                                    ? ""
                                    : 0
                              }
                              required={field !== "revives"}
                            />
                          </label>
                        ))}
                        <button className="primary-button">{t("save")}</button>
                      </form>
                    ) : row ? (
                      <div className="result-readonly">
                        {fields.map((field, index) => (
                          <span key={field}>
                            {t(labels[index])}: {row[field] ?? "—"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <EmptyState>{t("noStats")}</EmptyState>
                    )}
                    {row && (
                      <small>
                        {t("kda")}:{" "}
                        {calculateKda(
                          Number(row.kills),
                          Number(row.deaths),
                          Number(row.assists),
                        ).toFixed(2)}
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </Shell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { ClassBadge, EmptyState } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocale, translate } from "@/lib/i18n";
import type { GuildClassId } from "@/lib/guild-classes";
import { calculateKda } from "@/domain/statistics";

export const dynamic = "force-dynamic";
export default async function WarDetail({
  params,
}: {
  params: Promise<{ warId: string }>;
}) {
  const account = await requireRole();
  const { warId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(warId)) notFound();
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const supabase = await createClient();
  const { data: war } = await supabase
    .from("wars")
    .select("id,war_number,war_date,status,finalized_at")
    .eq("id", warId)
    .single();
  if (!war || war.status !== "finalized") notFound();
  const { data: assignments } = await supabase
    .from("war_assignments")
    .select(
      "id,player_id,player_name_snapshot,class_snapshot,party,squad_number,slot_number,ultimate_name_snapshot,ultimate_icon_path_snapshot,attendance_snapshot",
    )
    .eq("war_id", warId)
    .order("party")
    .order("squad_number")
    .order("slot_number");
  const { data: stats } = assignments?.length
    ? await supabase
        .from("war_player_stats")
        .select(
          "war_assignment_id,kills,deaths,assists,damage,healing,damage_taken,tower_damage,revives",
        )
        .in(
          "war_assignment_id",
          assignments.map((a) => a.id),
        )
    : { data: null };
  const statsByAssignment = new Map(
    stats?.map((row) => [row.war_assignment_id, row]),
  );
  const iconBase = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ultimate-icons`
    : "";
  return (
    <Shell account={account} title="history">
      <div className="section-title">
        <h2>
          #{war.war_number} · {war.war_date}
        </h2>
        <Link className="secondary-button" href={`/results?war=${war.id}`}>
          {t("results")}
        </Link>
      </div>
      <div className="history-grid">
        {(["A", "B"] as const).map((party) => (
          <section key={party}>
            <h2>{t(party === "A" ? "partyA" : "partyB")}</h2>
            {[1, 2, 3, 4, 5].map((squad) => {
              const occupants =
                assignments?.filter(
                  (a) => a.party === party && a.squad_number === squad,
                ) ?? [];
              return (
                <div key={squad} className="panel history-squad">
                  <h3>
                    {party}
                    {squad} · {occupants.length}/6
                  </h3>
                  {!occupants.length ? (
                    <EmptyState>{t("empty")}</EmptyState>
                  ) : (
                    occupants.map((a) => {
                      const row = statsByAssignment.get(a.id);
                      return (
                        <div key={a.id} className="history-player">
                          <span className="eyebrow">{a.slot_number}</span>
                          <strong>{a.player_name_snapshot}</strong>
                          <ClassBadge
                            classId={a.class_snapshot as GuildClassId}
                          />
                          <span className="inline-form">
                            {a.ultimate_name_snapshot && (
                              <span
                                className="ultimate-icon"
                                aria-hidden="true"
                                style={
                                  a.ultimate_icon_path_snapshot && iconBase
                                    ? {
                                        backgroundImage: `url(${iconBase}/${a.ultimate_icon_path_snapshot.split("/").map(encodeURIComponent).join("/")})`,
                                      }
                                    : undefined
                                }
                              >
                                {a.ultimate_icon_path_snapshot && iconBase
                                  ? ""
                                  : "✦"}
                              </span>
                            )}
                            {a.ultimate_name_snapshot ?? "—"}
                          </span>
                          <small>
                            {t(
                              a.attendance_snapshot === "LEAVE"
                                ? "leave"
                                : a.attendance_snapshot === "AVAILABLE"
                                  ? "available"
                                  : "unknown",
                            )}
                          </small>
                          {row && (
                            <div className="history-stats">
                              <span>
                                {t("kills")}: {row.kills}
                              </span>
                              <span>
                                {t("deaths")}: {row.deaths}
                              </span>
                              <span>
                                {t("assists")}: {row.assists}
                              </span>
                              <span>
                                {t("kda")}:{" "}
                                {calculateKda(
                                  Number(row.kills),
                                  Number(row.deaths),
                                  Number(row.assists),
                                ).toFixed(2)}
                              </span>
                              <span>
                                {t("damage")}: {row.damage}
                              </span>
                              <span>
                                {t("healing")}: {row.healing}
                              </span>
                              <span>
                                {t("damageTaken")}: {row.damage_taken}
                              </span>
                              <span>
                                {t("towerDamage")}: {row.tower_damage}
                              </span>
                              {row.revives !== null && (
                                <span>
                                  {t("revives")}: {row.revives}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </Shell>
  );
}

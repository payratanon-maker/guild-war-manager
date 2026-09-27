import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { ClassBadge, EmptyState, ErrorState, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadStatisticsData } from "@/lib/statistics-data";
import { aggregateStatistics, calculateKda } from "@/domain/statistics";
import { getLocale, translate } from "@/lib/i18n";
import type { GuildClassId } from "@/lib/guild-classes";

export const dynamic = "force-dynamic";
export default async function PlayerProfile({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const account = await requireRole();
  const { playerId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) notFound();
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const supabase = await createClient();
  const { data: player } = await supabase
    .from("guild_players")
    .select("id,display_name,current_class,archived_at")
    .eq("id", playerId)
    .single();
  if (!player) notFound();
  let wars: Awaited<ReturnType<typeof loadStatisticsData>>["wars"] = [];
  let records: Awaited<ReturnType<typeof loadStatisticsData>>["records"] = [];
  let statsFailed = false;
  try {
    ({ wars, records } = await loadStatisticsData());
  } catch {
    statsFailed = true;
  }
  const own = records.filter((row) => row.playerId === playerId);
  const aggregate = aggregateStatistics(wars, own, { period: "ALL_TIME" })
    .players[0];
  const warById = new Map(wars.map((war) => [war.id, war]));
  const recent = [...own].sort((a, b) => b.warNumber - a.warNumber);
  return (
    <Shell account={account} title="members">
      <div className="section-title">
        <h2>{player.display_name}</h2>
        <Link className="text-button" href="/members">
          {t("members")} →
        </Link>
      </div>
      <div className="panel">
        <div className="inline-form">
          <span>{t("currentClass")}:</span>
          <ClassBadge classId={player.current_class as GuildClassId} />
          <span>{t(player.archived_at ? "formerMember" : "activeMember")}</span>
        </div>
      </div>
      {statsFailed && <ErrorState>{t("error")}</ErrorState>}
      <div className="cards-grid">
        <StatCard label={t("wars")} value={aggregate?.wars ?? 0} />
        <StatCard label={t("kills")} value={aggregate?.kills ?? 0} />
        <StatCard label={t("deaths")} value={aggregate?.deaths ?? 0} />
        <StatCard label={t("assists")} value={aggregate?.assists ?? 0} />
        <StatCard
          label={t("kda")}
          value={aggregate?.kda.toFixed(2) ?? "0.00"}
        />
        <StatCard label={t("damage")} value={aggregate?.damage ?? 0} />
        <StatCard label={t("healing")} value={aggregate?.healing ?? 0} />
        <StatCard
          label={t("damageTaken")}
          value={aggregate?.damageTaken ?? 0}
        />
        <StatCard
          label={t("towerDamage")}
          value={aggregate?.towerDamage ?? 0}
        />
        <StatCard label={t("revives")} value={aggregate?.revives ?? 0} />
      </div>
      <section className="panel">
        <h2>{t("recentWars")}</h2>
        {!statsFailed && !recent.length && (
          <EmptyState>{t("empty")}</EmptyState>
        )}
        {recent.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("warNumber")}</th>
                  <th>{t("warDate")}</th>
                  <th>{t("class")}</th>
                  <th>{t("assigned")}</th>
                  <th>{t("kills")}</th>
                  <th>{t("deaths")}</th>
                  <th>{t("assists")}</th>
                  <th>{t("kda")}</th>
                  <th>{t("damage")}</th>
                  <th>{t("healing")}</th>
                  <th>{t("damageTaken")}</th>
                  <th>{t("towerDamage")}</th>
                  <th>{t("revives")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.warId}>
                    <td>
                      <Link href={`/history/${row.warId}`}>
                        #{row.warNumber}
                      </Link>
                    </td>
                    <td>{warById.get(row.warId)?.warDate ?? "—"}</td>
                    <td>
                      <ClassBadge classId={row.classSnapshot} />
                    </td>
                    <td>
                      {row.party}
                      {row.squadNumber}
                    </td>
                    <td>{row.stats?.kills ?? "—"}</td>
                    <td>{row.stats?.deaths ?? "—"}</td>
                    <td>{row.stats?.assists ?? "—"}</td>
                    <td>
                      {row.stats
                        ? calculateKda(
                            row.stats.kills,
                            row.stats.deaths,
                            row.stats.assists,
                          ).toFixed(2)
                        : "—"}
                    </td>
                    <td>{row.stats?.damage ?? "—"}</td>
                    <td>{row.stats?.healing ?? "—"}</td>
                    <td>{row.stats?.damageTaken ?? "—"}</td>
                    <td>{row.stats?.towerDamage ?? "—"}</td>
                    <td>{row.stats?.revives ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}

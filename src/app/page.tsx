import Link from "next/link";
import { Shell } from "@/components/shell";
import { EmptyState, ErrorState, StatCard } from "@/components/ui";
import { requireRole, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocale, translate } from "@/lib/i18n";
import { guildClasses } from "@/lib/guild-classes";
import { loadStatisticsData } from "@/lib/statistics-data";
import { aggregateStatistics, leaderboardFields } from "@/domain/statistics";
import { summarizeDashboard } from "@/domain/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const account = await requireRole();
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const supabase = await createClient();
  const [playersResult, assignmentsResult, warsResult] = await Promise.all([
    supabase.from("guild_players").select("id,current_class,archived_at"),
    supabase
      .from("current_formation_assignments")
      .select("player_id,party,squad_number"),
    supabase
      .from("wars")
      .select("id,status")
      .eq("status", "preparing")
      .order("war_number", { ascending: false })
      .limit(1),
  ]);
  const queryFailed = !!(
    playersResult.error ||
    assignmentsResult.error ||
    warsResult.error
  );
  const players = playersResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const war = warsResult.data?.[0];
  const attendanceResult = war
    ? await supabase
        .from("war_attendance")
        .select("player_id,status")
        .eq("war_id", war.id)
    : { data: [], error: null };
  const queryError = queryFailed || !!attendanceResult.error;
  const summary = summarizeDashboard(
    players,
    assignments,
    attendanceResult.data ?? [],
  );
  let previews: ReturnType<typeof aggregateStatistics>["leaderboards"] | null =
    null;
  let statsFailed = false;
  try {
    const { wars: historyWars, records } = await loadStatisticsData();
    previews = aggregateStatistics(historyWars, records, {
      period: "THIS_WAR",
    }).leaderboards;
  } catch {
    statsFailed = true;
  }
  const metricLabels = {
    kills: "kills",
    assists: "assists",
    damage: "damage",
    healing: "healing",
    damageTaken: "damageTaken",
    towerDamage: "towerDamage",
    kda: "kda",
  } as const;
  return (
    <Shell account={account} title="dashboard">
      {(queryError || statsFailed) && <ErrorState>{t("error")}</ErrorState>}
      {!queryError && !summary.activeCount && (
        <EmptyState>{t("empty")}</EmptyState>
      )}
      {can(account.role, "ADMIN") && <PendingApprovalSummary />}
      <div className="cards-grid">
        <StatCard label={t("active")} value={summary.activeCount} />
        <StatCard label={t("available")} value={summary.availableCount} />
        <StatCard label={t("leave")} value={summary.leaveCount} />
        <StatCard label={t("assigned")} value={summary.assignedCount} />
        <StatCard label={t("unassigned")} value={summary.unassignedCount} />
        <StatCard label={t("partyA")} value={summary.partyACount} />
        <StatCard label={t("partyB")} value={summary.partyBCount} />
      </div>
      <div className="dashboard-sections">
        <section className="panel">
          <h2>{t("class")}</h2>
          <div className="class-overview">
            {guildClasses.map((item) => {
              const row = summary.classSummary.find(
                (classSummary) => classSummary.id === item.id,
              );
              return (
                <div key={item.id} className="class-overview-row">
                  <span
                    className="class-dot"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.name}
                  <strong>{row?.count ?? 0}</strong>
                  <span className="muted">
                    {row?.percentage ?? 0}% {t("memberShare")}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <h2>{t("currentFormation")}</h2>
          <div className="squad-overview">
            {summary.squads.map(({ party, squadNumber, count }) => (
              <div key={party + squadNumber}>
                <span>
                  {party}
                  {squadNumber}
                </span>
                <strong>{count}/6</strong>
              </div>
            ))}
          </div>
          <Link className="text-button" href="/builder">
            {t("builder")} →
          </Link>
        </section>
      </div>
      <section className="panel">
        <h2>{t("top")}</h2>
        <div className="dashboard-leaders">
          {leaderboardFields.map((field) => {
            const rows = previews?.[field] ?? [];
            return (
              <div key={field}>
                <span className="eyebrow">{t(metricLabels[field])}</span>
                {rows.length ? (
                  <ol>
                    {rows.slice(0, 3).map((player, index) => (
                      <li key={player.playerId}>
                        <span>
                          {index + 1}.{" "}
                          <Link href={"/members/" + player.playerId}>
                            {player.playerName}
                          </Link>
                        </span>
                        <strong>
                          {field === "kda"
                            ? player.kda.toFixed(2)
                            : player[field].toLocaleString()}
                        </strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <span>{t("noStats")}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </Shell>
  );
}

async function PendingApprovalSummary() {
  const locale = await getLocale();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("account_profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");
  if (error || !count) return null;
  return (
    <Link className="panel approval-summary" href="/approvals">
      {translate(locale, "pendingApprovals")}: <strong>{count}</strong>
    </Link>
  );
}

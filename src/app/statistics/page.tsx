import Link from "next/link";
import { Shell } from "@/components/shell";
import { ClassBadge, EmptyState, ErrorState } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getLocale, translate, type MessageKey } from "@/lib/i18n";
import { guildClasses, type GuildClassId } from "@/lib/guild-classes";
import {
  aggregateStatistics,
  leaderboardFields,
  type Period,
  type PlayerAggregate,
  type LeaderboardField,
} from "@/domain/statistics";
import { loadStatisticsData } from "@/lib/statistics-data";

export const dynamic = "force-dynamic";
type Query = {
  period?: string;
  war?: string;
  class?: string;
  party?: string;
  membership?: string;
  sort?: string;
  direction?: string;
};
const sortFields = [
  "playerName",
  "classSnapshot",
  "wars",
  "kills",
  "deaths",
  "assists",
  "kda",
  "damage",
  "healing",
  "damageTaken",
  "towerDamage",
] as const;
type SortField = (typeof sortFields)[number];
const labelFor: Record<LeaderboardField, MessageKey> = {
  kills: "kills",
  assists: "assists",
  damage: "damage",
  healing: "healing",
  damageTaken: "damageTaken",
  towerDamage: "towerDamage",
  kda: "kda",
};
const tableLabels: Record<SortField, MessageKey> = {
  playerName: "name",
  classSnapshot: "class",
  wars: "wars",
  kills: "kills",
  deaths: "deaths",
  assists: "assists",
  kda: "kda",
  damage: "damage",
  healing: "healing",
  damageTaken: "damageTaken",
  towerDamage: "towerDamage",
};

export default async function Statistics({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const account = await requireRole();
  const query = await searchParams;
  const locale = await getLocale();
  const t = (key: MessageKey) => translate(locale, key);
  let wars: Awaited<ReturnType<typeof loadStatisticsData>>["wars"] = [];
  let records: Awaited<ReturnType<typeof loadStatisticsData>>["records"] = [];
  let loadError = false;
  try {
    ({ wars, records } = await loadStatisticsData());
  } catch {
    loadError = true;
  }
  const period: Period =
    query.period === "LAST_5" || query.period === "ALL_TIME"
      ? query.period
      : "THIS_WAR";
  const classId = guildClasses.some((item) => item.id === query.class)
    ? (query.class as GuildClassId)
    : undefined;
  const party =
    query.party === "A" || query.party === "B" ? query.party : undefined;
  const membership = query.membership === "active" ? "active" : "all";
  const result = aggregateStatistics(wars, records, {
    period,
    warId: query.war,
    classId,
    party,
    membership,
  });
  const sort: SortField = sortFields.includes(query.sort as SortField)
    ? (query.sort as SortField)
    : "kills";
  const direction = query.direction === "asc" ? "asc" : "desc";
  const sorted = [...result.players].sort((a, b) => {
    const left = a[sort],
      right = b[sort];
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
    return (
      (direction === "asc" ? comparison : -comparison) ||
      a.playerName.localeCompare(b.playerName) ||
      a.playerId.localeCompare(b.playerId)
    );
  });
  const sortHref = (field: SortField) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (
        value &&
        ["period", "war", "class", "party", "membership"].includes(key)
      )
        params.set(key, value);
    params.set("sort", field);
    params.set(
      "direction",
      sort === field && direction === "desc" ? "asc" : "desc",
    );
    return `/statistics?${params.toString()}`;
  };
  return (
    <Shell account={account} title="statistics">
      {loadError && <ErrorState>{t("error")}</ErrorState>}
      <form className="toolbar stats-filters">
        <label>
          {t("filters")}
          <select name="period" defaultValue={period}>
            <option value="THIS_WAR">{t("thisWar")}</option>
            <option value="LAST_5">{t("lastFive")}</option>
            <option value="ALL_TIME">{t("allTime")}</option>
          </select>
        </label>
        <label>
          {t("warNumber")}
          <select name="war" defaultValue={query.war ?? ""}>
            <option value="">{t("all")}</option>
            {wars.map((war) => (
              <option key={war.id} value={war.id}>
                #{war.warNumber} · {war.warDate}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("class")}
          <select name="class" defaultValue={classId ?? ""}>
            <option value="">{t("all")}</option>
            {guildClasses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("assigned")}
          <select name="party" defaultValue={party ?? ""}>
            <option value="">{t("all")}</option>
            <option value="A">{t("partyA")}</option>
            <option value="B">{t("partyB")}</option>
          </select>
        </label>
        <label>
          {t("status")}
          <select name="membership" defaultValue={membership}>
            <option value="all">{t("historical")}</option>
            <option value="active">{t("active")}</option>
          </select>
        </label>
        <button className="primary-button">{t("filters")}</button>
      </form>
      {!loadError && !wars.length ? (
        <EmptyState>{t("noStats")}</EmptyState>
      ) : !loadError ? (
        <>
          <div className="leaderboard-grid">
            {leaderboardFields.map((field) => (
              <section key={field} className="panel">
                <h2>
                  {t("top")} {t(labelFor[field])}
                </h2>
                {!result.leaderboards[field].length ? (
                  <EmptyState>{t("noStats")}</EmptyState>
                ) : (
                  <ol>
                    {result.leaderboards[field].slice(0, 5).map((player) => (
                      <li key={player.playerId}>
                        <Link href={`/members/${player.playerId}`}>
                          {player.playerName}
                        </Link>
                        <strong>
                          {field === "kda"
                            ? player.kda.toFixed(2)
                            : player[field].toLocaleString()}
                        </strong>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>{t("statistics")}</h2>
            {!sorted.length ? (
              <EmptyState>{t("noStats")}</EmptyState>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {sortFields.map((field) => (
                        <th key={field}>
                          <Link href={sortHref(field)}>
                            {t(tableLabels[field])}
                            {sort === field
                              ? direction === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((player: PlayerAggregate) => (
                      <tr key={player.playerId}>
                        <td>
                          <Link href={`/members/${player.playerId}`}>
                            {player.playerName}
                          </Link>
                        </td>
                        <td>
                          <ClassBadge classId={player.classSnapshot} />
                        </td>
                        <td>{player.wars}</td>
                        <td>{player.kills.toLocaleString()}</td>
                        <td>{player.deaths.toLocaleString()}</td>
                        <td>{player.assists.toLocaleString()}</td>
                        <td>{player.kda.toFixed(2)}</td>
                        <td>{player.damage.toLocaleString()}</td>
                        <td>{player.healing.toLocaleString()}</td>
                        <td>{player.damageTaken.toLocaleString()}</td>
                        <td>{player.towerDamage.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </Shell>
  );
}

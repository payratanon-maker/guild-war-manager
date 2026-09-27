import { Shell } from "@/components/shell";
import { ClassBadge, EmptyState, ErrorState, StatCard } from "@/components/ui";
import { can, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocale, translate } from "@/lib/i18n";
import { guildClasses, type GuildClassId } from "@/lib/guild-classes";
import { savePlayer, setArchived, setAttendance } from "./actions";
import Link from "next/link";
import { ConfirmForm } from "@/components/confirm-form";

export const dynamic = "force-dynamic";

export default async function Members({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    class?: string;
    view?: string;
    error?: string;
  }>;
}) {
  const account = await requireRole();
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const {
    q = "",
    class: classFilter = "",
    view = "active",
    error,
  } = await searchParams;
  const supabase = await createClient();
  const [playersResult, assignmentsResult, warsResult] = await Promise.all([
    supabase
      .from("guild_players")
      .select("id,display_name,current_class,archived_at")
      .order("display_name"),
    supabase.from("current_formation_assignments").select("player_id"),
    supabase
      .from("wars")
      .select("id,war_number,status")
      .eq("status", "preparing")
      .order("war_number", { ascending: false })
      .limit(1),
  ]);
  const players = playersResult.data;
  const assignments = assignmentsResult.data;
  const wars = warsResult.data;
  const war = wars?.[0];
  const attendanceResult = war
    ? await supabase
        .from("war_attendance")
        .select("player_id,status")
        .eq("war_id", war.id)
    : { data: null };
  const attendance = attendanceResult.data;
  const loadError = !!(
    playersResult.error ||
    assignmentsResult.error ||
    warsResult.error ||
    (war && "error" in attendanceResult && attendanceResult.error)
  );
  const statusByPlayer = new Map(
    attendance?.map((row) => [row.player_id, row.status]),
  );
  const assignedIds = new Set(assignments?.map((row) => row.player_id));
  const activePlayers = players?.filter((player) => !player.archived_at) ?? [];
  const activeIds = new Set(activePlayers.map((player) => player.id));
  const activeAttendance =
    attendance?.filter((row) => activeIds.has(row.player_id)) ?? [];
  const visible =
    players?.filter(
      (player) =>
        (view === "archived" ? !!player.archived_at : !player.archived_at) &&
        (!q || player.display_name.toLowerCase().includes(q.toLowerCase())) &&
        (!classFilter || player.current_class === classFilter),
    ) ?? [];
  return (
    <Shell account={account} title="members">
      {loadError && <ErrorState>{t("error")}</ErrorState>}
      {error && (
        <ErrorState>
          {t(error === "validation" ? "validation" : "error")}
        </ErrorState>
      )}
      <div className="cards-grid">
        <StatCard label={t("active")} value={activePlayers.length} />
        <StatCard
          label={t("available")}
          value={
            activeAttendance.filter((row) => row.status === "AVAILABLE").length
          }
        />
        <StatCard
          label={t("leave")}
          value={
            activeAttendance.filter((row) => row.status === "LEAVE").length
          }
        />
        <StatCard label={t("assigned")} value={assignedIds.size} />
        <StatCard
          label={t("unassigned")}
          value={activePlayers.length - assignedIds.size}
        />
      </div>
      {can(account.role, "ADMIN") && (
        <section className="panel">
          <h2>{t("addPlayer")}</h2>
          <form action={savePlayer} className="toolbar">
            <label>
              {t("name")}
              <input name="displayName" maxLength={100} required />
            </label>
            <label>
              {t("class")}
              <select name="currentClass">
                {guildClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button">{t("addPlayer")}</button>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="section-title">
          <h2>{t(view === "archived" ? "archived" : "active")}</h2>
          <div className="inline-form">
            <Link className="text-button" href="/members?view=active">
              {t("active")}
            </Link>
            <Link className="text-button" href="/members?view=archived">
              {t("archived")}
            </Link>
          </div>
        </div>
        <form className="toolbar">
          <input type="hidden" name="view" value={view} />
          <label>
            {t("search")}
            <input name="q" defaultValue={q} />
          </label>
          <label>
            {t("class")}
            <select name="class" defaultValue={classFilter}>
              <option value="">{t("all")}</option>
              {guildClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button">{t("filters")}</button>
        </form>
        {!loadError && !visible.length ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : !loadError ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("name")}</th>
                  <th>{t("class")}</th>
                  <th>{t("attendance")}</th>
                  <th>{t("assigned")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((player) => {
                  const attendanceStatus =
                    statusByPlayer.get(player.id) ?? "UNKNOWN";
                  return (
                    <tr key={player.id}>
                      <td>
                        <Link href={`/members/${player.id}`}>
                          {player.display_name}
                        </Link>
                      </td>
                      <td>
                        <ClassBadge
                          classId={player.current_class as GuildClassId}
                        />
                      </td>
                      <td>
                        {war && !player.archived_at ? (
                          can(account.role, "OFFICER") ? (
                            <form
                              action={setAttendance}
                              className="inline-form"
                            >
                              <input
                                type="hidden"
                                name="warId"
                                value={war.id}
                              />
                              <input
                                type="hidden"
                                name="playerId"
                                value={player.id}
                              />
                              <select
                                name="status"
                                defaultValue={attendanceStatus}
                                aria-label={`${t("attendance")}: ${player.display_name}`}
                              >
                                <option value="UNKNOWN">{t("unknown")}</option>
                                <option value="AVAILABLE">
                                  {t("available")}
                                </option>
                                <option value="LEAVE">{t("leave")}</option>
                              </select>
                              <button>{t("save")}</button>
                            </form>
                          ) : (
                            t(
                              attendanceStatus === "LEAVE"
                                ? "leave"
                                : attendanceStatus === "AVAILABLE"
                                  ? "available"
                                  : "unknown",
                            )
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {assignedIds.has(player.id)
                          ? t("assigned")
                          : t("unassigned")}
                      </td>
                      <td>
                        {can(account.role, "ADMIN") && (
                          <div className="member-actions">
                            <form action={savePlayer} className="inline-form">
                              <input
                                type="hidden"
                                name="id"
                                value={player.id}
                              />
                              <input
                                name="displayName"
                                defaultValue={player.display_name}
                                aria-label={`${t("name")}: ${player.display_name}`}
                                maxLength={100}
                                required
                              />
                              <select
                                name="currentClass"
                                defaultValue={player.current_class}
                                aria-label={`${t("class")}: ${player.display_name}`}
                              >
                                {guildClasses.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                              <button>{t("save")}</button>
                            </form>
                            <ConfirmForm
                              action={setArchived}
                              confirmation={
                                player.archived_at
                                  ? t("confirmRestorePlayer")
                                  : `${t("confirmArchivePlayer")}: ${player.display_name}`
                              }
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={player.id}
                              />
                              <input
                                type="hidden"
                                name="archived"
                                value={String(!player.archived_at)}
                              />
                              <button
                                className="text-button"
                                disabled={
                                  !player.archived_at &&
                                  (assignedIds.has(player.id) ||
                                    attendanceStatus === "AVAILABLE")
                                }
                              >
                                {t(player.archived_at ? "restore" : "archive")}
                              </button>
                            </ConfirmForm>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {war && (
        <section className="panel">
          <h2>{t("leave")}</h2>
          <p>
            {activePlayers
              .filter((player) => statusByPlayer.get(player.id) === "LEAVE")
              .map((player) => player.display_name)
              .join(", ") || t("empty")}
          </p>
        </section>
      )}
      {!war && <p className="empty-state">{t("noWar")}</p>}
    </Shell>
  );
}

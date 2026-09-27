import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { getLocale, translate, translateRole } from "@/lib/i18n";
import { can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ErrorState, EmptyState } from "@/components/ui";
import {
  addUltimate,
  removeDiscordPlayerLink,
  saveDiscordPlayerLink,
  uploadUltimateIcon,
} from "./actions";
export const dynamic = "force-dynamic";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const account = await requireRole();
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: ultimates, error: ultimateError } = await supabase
    .from("ultimates")
    .select("id,code,name,icon_storage_path")
    .order("name");
  const admin = can(account.role, "ADMIN");
  const [linkResult, activePlayersResult] = admin
    ? await Promise.all([
        supabase
          .from("discord_player_links")
          .select("player_id,discord_user_id")
          .order("discord_user_id"),
        supabase
          .from("guild_players")
          .select("id,display_name")
          .is("archived_at", null)
          .order("display_name"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  const linkedIds = (linkResult.data ?? []).map((link) => link.player_id);
  const linkedPlayersResult =
    admin && linkedIds.length
      ? await supabase
          .from("guild_players")
          .select("id,display_name,archived_at")
          .in("id", linkedIds)
      : { data: [], error: null };
  const playerNames = new Map(
    (linkedPlayersResult.data ?? []).map((player) => [
      player.id,
      player.display_name +
        (player.archived_at ? " (" + t("archived") + ")" : ""),
    ]),
  );
  return (
    <Shell account={account} title="settings">
      {error === "discord" ? (
        <ErrorState>{t("discordLinkError")}</ErrorState>
      ) : (
        error && <ErrorState>{t("error")}</ErrorState>
      )}
      <div className="panel">
        <p>
          {translate(locale, "username")}: <strong>{account.username}</strong>
        </p>
        <p>
          {translate(locale, "role")}:{" "}
          <strong>{translateRole(locale, account.role)}</strong>
        </p>
      </div>
      <section className="panel">
        <h2>{t("discordAttendance")}</h2>
        <p className="muted">{t("discordSetupReference")}</p>
        {admin && (
          <>
            {(linkResult.error ||
              activePlayersResult.error ||
              linkedPlayersResult.error) && (
              <ErrorState>{t("error")}</ErrorState>
            )}
            <form action={saveDiscordPlayerLink} className="toolbar">
              <label>
                {t("guildPlayer")}
                <select name="playerId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {(activePlayersResult.data ?? []).map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("discordUserId")}
                <input
                  name="discordUserId"
                  inputMode="numeric"
                  pattern="[0-9]{17,20}"
                  minLength={17}
                  maxLength={20}
                  required
                />
              </label>
              <button className="primary-button">
                {t("linkDiscordAccount")}
              </button>
            </form>
            {!linkResult.error && !linkResult.data?.length ? (
              <EmptyState>{t("empty")}</EmptyState>
            ) : !linkResult.error && linkResult.data ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("guildPlayer")}</th>
                      <th>{t("discordUserId")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {linkResult.data.map((link) => (
                      <tr key={link.player_id}>
                        <td>
                          {playerNames.get(link.player_id) ?? link.player_id}
                        </td>
                        <td>{link.discord_user_id}</td>
                        <td>
                          <form action={removeDiscordPlayerLink}>
                            <input
                              type="hidden"
                              name="playerId"
                              value={link.player_id}
                            />
                            <button className="danger-button">
                              {t("unlinkDiscordAccount")}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>
      <section className="panel">
        <h2>{t("ultimate")}</h2>
        {ultimateError && <ErrorState>{t("settingsLoadError")}</ErrorState>}
        {can(account.role, "ADMIN") && (
          <form action={addUltimate} className="toolbar">
            <label>
              {t("code")}
              <input name="code" pattern="[a-z0-9_]{1,50}" required />
            </label>
            <label>
              {t("name")}
              <input name="name" maxLength={100} required />
            </label>
            <button className="primary-button">{t("save")}</button>
          </form>
        )}
        {ultimateError ? null : !ultimates?.length ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : ultimates ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("code")}</th>
                  <th>{t("name")}</th>
                  <th>{t("ultimate")}</th>
                </tr>
              </thead>
              <tbody>
                {ultimates.map((ultimate) => (
                  <tr key={ultimate.id}>
                    <td>{ultimate.code}</td>
                    <td>{ultimate.name}</td>
                    <td>
                      {ultimate.icon_storage_path
                        ? ultimate.icon_storage_path
                        : "—"}
                      {can(account.role, "ADMIN") && (
                        <form
                          action={uploadUltimateIcon}
                          className="inline-form"
                          encType="multipart/form-data"
                        >
                          <input type="hidden" name="id" value={ultimate.id} />
                          <input
                            type="file"
                            name="icon"
                            accept="image/png,image/webp"
                            required
                            aria-label={`${t("ultimate")}: ${ultimate.name}`}
                          />
                          <button>{t("save")}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </Shell>
  );
}

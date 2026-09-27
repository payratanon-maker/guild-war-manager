import { Shell } from "@/components/shell";
import { requireRole, can } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocale, translate } from "@/lib/i18n";
import type { GuildClassId } from "@/lib/guild-classes";
import type { Party } from "@/domain/model";
import { FormationBoard } from "./formation-board";
import { createWar, finalizeWar } from "./war-actions";
import { ErrorState } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
export const dynamic = "force-dynamic";

export default async function Builder({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const account = await requireRole();
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const supabase = await createClient();
  const { error } = await searchParams;
  const [playersResult, assignmentsResult, warsResult, ultimatesResult] =
    await Promise.all([
      supabase
        .from("guild_players")
        .select("id,display_name,current_class,archived_at")
        .order("display_name"),
      supabase
        .from("current_formation_assignments")
        .select("player_id,party,squad_number,slot_number,ultimate_id"),
      supabase
        .from("wars")
        .select("id,war_number,status")
        .eq("status", "preparing")
        .order("war_number", { ascending: false })
        .limit(1),
      supabase
        .from("ultimates")
        .select("id,name,code,icon_storage_path,active")
        .order("name"),
    ]);
  const players = playersResult.data;
  const assignments = assignmentsResult.data;
  const wars = warsResult.data;
  const ultimates = ultimatesResult.data;
  const attendanceResult = wars?.[0]
    ? await supabase
        .from("war_attendance")
        .select("player_id,status")
        .eq("war_id", wars[0].id)
        .eq("status", "LEAVE")
    : { data: null, error: null };
  const attendance = attendanceResult.data;
  const queryFailed = !!(
    playersResult.error ||
    assignmentsResult.error ||
    warsResult.error ||
    ultimatesResult.error ||
    attendanceResult.error
  );
  return (
    <Shell account={account} title="builder">
      {(error || queryFailed) && <ErrorState>{t("error")}</ErrorState>}
      {!queryFailed && can(account.role, "OFFICER") && (
        <section className="panel war-toolbar">
          {wars?.[0] ? (
            <ConfirmForm
              action={finalizeWar}
              confirmation={t("confirmFinalizeWar")}
              className="inline-form"
            >
              <strong>
                {t("warNumber")} #{wars[0].war_number}
              </strong>
              <input type="hidden" name="warId" value={wars[0].id} />
              <button className="primary-button">{t("finalize")}</button>
            </ConfirmForm>
          ) : (
            <form action={createWar} className="inline-form">
              <label>
                {t("warDate")}
                <input
                  type="date"
                  name="warDate"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <button className="primary-button">{t("createWar")}</button>
            </form>
          )}
        </section>
      )}
      {!queryFailed && (
        <FormationBoard
          players={
            (players ?? []) as {
              id: string;
              display_name: string;
              current_class: GuildClassId;
              archived_at: string | null;
            }[]
          }
          assignments={
            (assignments ?? []) as {
              player_id: string;
              party: Party;
              squad_number: number;
              slot_number: number;
              ultimate_id: string | null;
            }[]
          }
          leave={attendance?.map((row) => row.player_id) ?? []}
          editable={can(account.role, "OFFICER")}
          ultimates={ultimates ?? []}
          iconBase={
            process.env.NEXT_PUBLIC_SUPABASE_URL
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ultimate-icons`
              : ""
          }
          labels={{
            pool: t("pool"),
            search: t("search"),
            class: t("class"),
            all: t("all"),
            leave: t("leave"),
            select: t("select"),
            remove: t("remove"),
            ultimate: t("ultimate"),
            partyA: t("partyA"),
            partyB: t("partyB"),
            assigned: t("assigned"),
            empty: t("empty"),
            error: t("error"),
          }}
        />
      )}
    </Shell>
  );
}

import Link from "next/link";
import { Shell } from "@/components/shell";
import { EmptyState, ErrorState } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLocale, translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export default async function History() {
  const account = await requireRole();
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const supabase = await createClient();
  const { data: wars, error } = await supabase
    .from("wars")
    .select("id,war_number,war_date,status,finalized_at")
    .order("war_number", { ascending: false });
  return (
    <Shell account={account} title="history">
      {error && <ErrorState>{t("error")}</ErrorState>}
      <div className="panel">
        {!error && !wars?.length ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : !error && wars ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("warNumber")}</th>
                  <th>{t("warDate")}</th>
                  <th>{t("status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {wars.map((war) => (
                  <tr key={war.id}>
                    <td>#{war.war_number}</td>
                    <td>{war.war_date}</td>
                    <td>
                      {t(
                        war.status === "finalized" ? "finalized" : "preparing",
                      )}
                    </td>
                    <td>
                      <Link
                        className="text-button"
                        href={
                          war.status === "finalized"
                            ? `/history/${war.id}`
                            : "/builder"
                        }
                      >
                        {t(war.status === "finalized" ? "history" : "builder")}{" "}
                        →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

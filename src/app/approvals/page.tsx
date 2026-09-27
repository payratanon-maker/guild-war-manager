import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { ErrorState, EmptyState } from "@/components/ui";
import { decideAccount } from "@/app/auth/actions";
import {
  getLocale,
  translate,
  translateRole,
  translateStatus,
} from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const account = await requireRole("ADMIN");
  const supabase = await createClient();
  const { data: profiles, error: profilesError } = await supabase
    .from("account_profiles")
    .select("id,username,status,role")
    .order("created_at", { ascending: false });
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const { error } = await searchParams;
  return (
    <Shell account={account} title="approvals">
      {error && <ErrorState>{t("decision")}</ErrorState>}
      {profilesError && <ErrorState>{t("settingsLoadError")}</ErrorState>}
      <div className="panel">
        {!profilesError && !profiles?.length ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : !profilesError && profiles ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("username")}</th>
                  <th>{t("status")}</th>
                  <th>{t("role")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.username}</td>
                    <td>{translateStatus(locale, profile.status)}</td>
                    <td>{translateRole(locale, profile.role)}</td>
                    <td>
                      <form action={decideAccount} className="inline-form">
                        <input type="hidden" name="id" value={profile.id} />
                        <select
                          name="role"
                          defaultValue={profile.role ?? "MEMBER"}
                          aria-label={t("role")}
                        >
                          {[
                            "MEMBER",
                            "OFFICER",
                            ...(account.role === "OWNER"
                              ? ["ADMIN", "OWNER"]
                              : []),
                          ].map((role) => (
                            <option key={role} value={role}>
                              {translateRole(
                                locale,
                                role as
                                  "MEMBER" | "OFFICER" | "ADMIN" | "OWNER",
                              )}
                            </option>
                          ))}
                        </select>
                        <button name="decision" value="APPROVED">
                          {t("approve")}
                        </button>
                        <button name="decision" value="REJECTED">
                          {t("reject")}
                        </button>
                      </form>
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

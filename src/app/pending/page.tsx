import { getAccount } from "@/lib/auth";
import { getLocale, translate } from "@/lib/i18n";
import { logout } from "@/app/auth/actions";
import { LocaleSwitch } from "@/components/locale-switch";
export const dynamic = "force-dynamic";
export default async function Pending() {
  const account = await getAccount();
  const locale = await getLocale();
  return (
    <main className="auth-page">
      <div className="panel auth-card">
        <LocaleSwitch locale={locale} />
        <h1>{translate(locale, "pending")}</h1>
        <p>{account?.username}</p>
        <form action={logout}>
          <button className="text-button">{translate(locale, "logout")}</button>
        </form>
      </div>
    </main>
  );
}

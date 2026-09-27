import Link from "next/link";
import { getLocale, translate } from "@/lib/i18n";
import { LocaleSwitch } from "@/components/locale-switch";
export const dynamic = "force-dynamic";
export default async function Unauthorized() {
  const locale = await getLocale();
  return (
    <main className="auth-page">
      <div className="panel auth-card">
        <LocaleSwitch locale={locale} />
        <h1>{translate(locale, "unauthorized")}</h1>
        <Link href="/">{translate(locale, "dashboard")}</Link>
      </div>
    </main>
  );
}

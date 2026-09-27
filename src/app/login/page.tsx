import Link from "next/link";
import { login } from "@/app/auth/actions";
import { getLocale, translate } from "@/lib/i18n";
import { ErrorState } from "@/components/ui";
import { LocaleSwitch } from "@/components/locale-switch";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const locale = await getLocale();
  const t = (key: keyof typeof import("@/lib/i18n").messages.en) =>
    translate(locale, key);
  const { error } = await searchParams;
  const configured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return (
    <main className="auth-page">
      <div className="panel auth-card">
        <LocaleSwitch locale={locale} />
        <div className="brand">
          <span className="brand-mark">G</span>
          {t("app")}
        </div>
        <h1>{t("login")}</h1>
        {error && <ErrorState>{t("credentials")}</ErrorState>}
        {!configured && <ErrorState>{t("setup")}</ErrorState>}
        {configured && (
          <form action={login} className="form-stack">
            <label>
              {t("username")}
              <input
                name="username"
                minLength={3}
                maxLength={32}
                required
                autoComplete="username"
              />
            </label>
            <label>
              {t("password")}
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </label>
            <button className="primary-button">{t("login")}</button>
          </form>
        )}
        <p>
          <Link href="/register">{t("register")}</Link>
        </p>
      </div>
    </main>
  );
}

import Link from "next/link";
import { register } from "@/app/auth/actions";
import { getLocale, translate } from "@/lib/i18n";
import { ErrorState } from "@/components/ui";
import { LocaleSwitch } from "@/components/locale-switch";

export default async function Register({
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
        <h1>{t("register")}</h1>
        {error && (
          <ErrorState>
            {t(error === "validation" ? "validation" : "signup")}
          </ErrorState>
        )}
        {!configured && <ErrorState>{t("setup")}</ErrorState>}
        {configured && (
          <form action={register} className="form-stack">
            <label>
              {t("username")}
              <input
                name="username"
                pattern="[A-Za-z0-9_]{3,32}"
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
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              {t("confirmPassword")}
              <input
                type="password"
                name="confirmPassword"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            <button className="primary-button">{t("register")}</button>
          </form>
        )}
        <p>
          <Link href="/login">{t("login")}</Link>
        </p>
      </div>
    </main>
  );
}

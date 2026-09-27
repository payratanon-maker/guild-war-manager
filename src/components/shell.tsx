import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { LocaleSwitch } from "@/components/locale-switch";
import { can } from "@/lib/auth";
import {
  getLocale,
  translate,
  translateRole,
  type MessageKey,
} from "@/lib/i18n";
import type { AccountProfile } from "@/domain/model";

const nav: { href: string; key: MessageKey }[] = [
  { href: "/", key: "dashboard" },
  { href: "/members", key: "members" },
  { href: "/builder", key: "builder" },
  { href: "/results", key: "results" },
  { href: "/statistics", key: "statistics" },
  { href: "/history", key: "history" },
  { href: "/settings", key: "settings" },
];

export async function Shell({
  account,
  title,
  children,
}: {
  account: AccountProfile;
  title: MessageKey;
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const t = (key: MessageKey) => translate(locale, key);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">G</span>
          <span>{t("app")}</span>
        </Link>
        <nav aria-label={t("app")} className="nav-list">
          {nav.map(({ href, key }) => (
            <Link key={href} href={href} className="nav-link">
              {t(key)}
            </Link>
          ))}
          {can(account.role, "OFFICER") && (
            <Link href="/results/extraction" className="nav-link">
              {t("ocr")}
            </Link>
          )}
          {can(account.role, "ADMIN") && (
            <Link href="/approvals" className="nav-link">
              {t("approvals")}
            </Link>
          )}
        </nav>
        <div className="sidebar-footer">
          <strong>{account.username}</strong>
          <span>{translateRole(locale, account.role)}</span>
          <form action={logout}>
            <button className="text-button">{t("logout")}</button>
          </form>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <h1>{t(title)}</h1>
          <LocaleSwitch locale={locale} />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

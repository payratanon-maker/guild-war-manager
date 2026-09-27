import { setLocale } from "@/app/locale/actions";
import { translate, type Locale } from "@/lib/i18n";
export function LocaleSwitch({ locale }: { locale: Locale }) {
  return (
    <form
      action={setLocale}
      className="locale-switch"
      aria-label={translate(locale, "language")}
    >
      <button name="locale" value="th" aria-pressed={locale === "th"}>
        TH
      </button>
      <span aria-hidden="true">/</span>
      <button name="locale" value="en" aria-pressed={locale === "en"}>
        EN
      </button>
    </form>
  );
}

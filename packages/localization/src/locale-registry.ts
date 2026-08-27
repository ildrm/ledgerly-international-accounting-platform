export const UI_LOCALES = [
  "en-US",
  "fa-IR",
  "de-DE",
  "tr-TR",
  "ar-SA",
  "ru-RU",
  "fr-FR",
  "es-ES",
  "it-IT",
  "zh-Hans-CN",
  "ja-JP",
] as const;

export type UiLocale = (typeof UI_LOCALES)[number];
export type TextDirection = "ltr" | "rtl";
export type CalendarId = "gregory" | "persian";
export type NumberingSystem = "latn" | "arab" | "arabext";

const CALENDARS = ["gregory", "persian"] as const;
const NUMBERING_SYSTEMS = ["latn", "arab", "arabext"] as const;

export interface LocaleDefinition {
  readonly id: UiLocale;
  readonly language: string;
  readonly nativeName: string;
  readonly englishName: string;
  readonly direction: TextDirection;
  readonly defaultFormatLocale: string;
  readonly defaultCalendar: CalendarId;
  readonly supportedCalendars: readonly CalendarId[];
  readonly defaultNumberingSystem: NumberingSystem;
  readonly supportedNumberingSystems: readonly NumberingSystem[];
  readonly aliases: readonly string[];
}

function definition(
  value: Omit<LocaleDefinition, "supportedCalendars" | "supportedNumberingSystems">,
): LocaleDefinition {
  return Object.freeze({
    ...value,
    // Presentation choices intentionally stay independent from UI language.
    supportedCalendars: CALENDARS,
    supportedNumberingSystems: NUMBERING_SYSTEMS,
  });
}

export const LOCALE_DEFINITIONS = Object.freeze({
  "en-US": definition({
    id: "en-US", language: "en", nativeName: "English", englishName: "English",
    direction: "ltr", defaultFormatLocale: "en-US", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["en", "en-GB", "en-CA", "en-AU", "en-NZ", "en-IE"],
  }),
  "fa-IR": definition({
    id: "fa-IR", language: "fa", nativeName: "فارسی", englishName: "Persian",
    direction: "rtl", defaultFormatLocale: "fa-IR", defaultCalendar: "persian",
    defaultNumberingSystem: "arabext", aliases: ["fa", "fa-AF"],
  }),
  "de-DE": definition({
    id: "de-DE", language: "de", nativeName: "Deutsch", englishName: "German",
    direction: "ltr", defaultFormatLocale: "de-DE", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["de", "de-AT", "de-CH", "de-LI"],
  }),
  "tr-TR": definition({
    id: "tr-TR", language: "tr", nativeName: "Türkçe", englishName: "Turkish",
    direction: "ltr", defaultFormatLocale: "tr-TR", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["tr", "tr-CY"],
  }),
  "ar-SA": definition({
    id: "ar-SA", language: "ar", nativeName: "العربية", englishName: "Arabic",
    direction: "rtl", defaultFormatLocale: "ar-SA", defaultCalendar: "gregory",
    defaultNumberingSystem: "arab", aliases: [
      "ar", "ar-EG", "ar-AE", "ar-BH", "ar-DZ", "ar-IQ", "ar-JO", "ar-KW",
      "ar-LB", "ar-MA", "ar-OM", "ar-QA", "ar-TN",
    ],
  }),
  "ru-RU": definition({
    id: "ru-RU", language: "ru", nativeName: "Русский", englishName: "Russian",
    direction: "ltr", defaultFormatLocale: "ru-RU", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["ru", "ru-BY", "ru-KZ", "ru-KG"],
  }),
  "fr-FR": definition({
    id: "fr-FR", language: "fr", nativeName: "Français", englishName: "French",
    direction: "ltr", defaultFormatLocale: "fr-FR", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["fr", "fr-BE", "fr-CA", "fr-CH", "fr-LU"],
  }),
  "es-ES": definition({
    id: "es-ES", language: "es", nativeName: "Español", englishName: "Spanish",
    direction: "ltr", defaultFormatLocale: "es-ES", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["es", "es-MX", "es-AR", "es-CL", "es-CO", "es-PE", "es-US"],
  }),
  "it-IT": definition({
    id: "it-IT", language: "it", nativeName: "Italiano", englishName: "Italian",
    direction: "ltr", defaultFormatLocale: "it-IT", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["it", "it-CH", "it-SM"],
  }),
  "zh-Hans-CN": definition({
    id: "zh-Hans-CN", language: "zh", nativeName: "简体中文", englishName: "Simplified Chinese",
    direction: "ltr", defaultFormatLocale: "zh-CN", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-SG"],
  }),
  "ja-JP": definition({
    id: "ja-JP", language: "ja", nativeName: "日本語", englishName: "Japanese",
    direction: "ltr", defaultFormatLocale: "ja-JP", defaultCalendar: "gregory",
    defaultNumberingSystem: "latn", aliases: ["ja"],
  }),
} satisfies Record<UiLocale, LocaleDefinition>);

const LANGUAGE_TO_UI_LOCALE: Readonly<Record<string, UiLocale>> = Object.freeze({
  en: "en-US", fa: "fa-IR", de: "de-DE", tr: "tr-TR", ar: "ar-SA", ru: "ru-RU",
  fr: "fr-FR", es: "es-ES", it: "it-IT", ja: "ja-JP",
});

const aliasEntries = UI_LOCALES.flatMap((locale) => {
  const localeDefinition = LOCALE_DEFINITIONS[locale];
  return [localeDefinition.id, ...localeDefinition.aliases].map(
    (alias) => [canonicalizeBcp47(alias), locale] as const,
  );
});

const ALIAS_TO_UI_LOCALE = new Map<string, UiLocale>(
  aliasEntries.filter((entry): entry is readonly [string, UiLocale] => entry[0] !== null),
);

export function canonicalizeBcp47(input: string): string | null {
  const candidate = input.trim().replaceAll("_", "-");
  if (candidate.length === 0 || candidate.length > 255 || candidate === "*") return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

export function matchUiLocale(input: string | null | undefined): UiLocale | null {
  if (input === null || input === undefined) return null;
  const canonical = canonicalizeBcp47(input);
  if (canonical === null) return null;

  const directMatch = ALIAS_TO_UI_LOCALE.get(canonical);
  if (directMatch !== undefined) return directMatch;

  const parsed = new Intl.Locale(canonical);
  if (parsed.language === "zh") {
    const traditional = parsed.script === "Hant" || ["TW", "HK", "MO"].includes(parsed.region ?? "");
    return traditional ? null : "zh-Hans-CN";
  }
  return LANGUAGE_TO_UI_LOCALE[parsed.language] ?? null;
}

export function isUiLocale(value: string): value is UiLocale {
  return (UI_LOCALES as readonly string[]).includes(value);
}

export function requireUiLocale(value: string): UiLocale {
  const locale = matchUiLocale(value);
  if (locale === null) throw new RangeError(`Unsupported UI locale: ${value}`);
  return locale;
}

export function getLocaleDefinition(locale: UiLocale): LocaleDefinition {
  return LOCALE_DEFINITIONS[locale];
}

export function getTextDirection(locale: UiLocale): TextDirection {
  return LOCALE_DEFINITIONS[locale].direction;
}

export interface IntlLocaleOverrides {
  readonly formatLocale?: string;
  readonly calendar?: CalendarId;
  readonly numberingSystem?: NumberingSystem;
}

export function buildIntlLocale(locale: UiLocale, overrides: IntlLocaleOverrides = {}): string {
  const localeDefinition = getLocaleDefinition(locale);
  const baseLocale = overrides.formatLocale ?? localeDefinition.defaultFormatLocale;
  const canonicalBase = canonicalizeBcp47(baseLocale);
  if (canonicalBase === null) throw new RangeError(`Invalid formatting locale: ${baseLocale}`);

  const calendar = overrides.calendar ?? localeDefinition.defaultCalendar;
  const numberingSystem = overrides.numberingSystem ?? localeDefinition.defaultNumberingSystem;
  if (!(CALENDARS as readonly string[]).includes(calendar)) throw new RangeError(`Unsupported calendar: ${calendar}`);
  if (!(NUMBERING_SYSTEMS as readonly string[]).includes(numberingSystem)) {
    throw new RangeError(`Unsupported numbering system: ${numberingSystem}`);
  }
  return new Intl.Locale(canonicalBase, { calendar, numberingSystem }).toString();
}

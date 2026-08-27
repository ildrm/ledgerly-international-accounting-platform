import {
  UI_LOCALES,
  canonicalizeBcp47,
  getTextDirection,
  matchUiLocale,
  type TextDirection,
  type UiLocale,
} from "./locale-registry.js";

export interface LanguageRange {
  readonly range: string;
  readonly quality: number;
  readonly position: number;
}

const MAX_ACCEPT_LANGUAGE_LENGTH = 1024;
const MAX_LANGUAGE_RANGES = 32;

export function parseAcceptLanguage(header: string | null | undefined): readonly LanguageRange[] {
  if (header === null || header === undefined || header.length > MAX_ACCEPT_LANGUAGE_LENGTH) {
    return [];
  }

  const parsed: LanguageRange[] = [];
  const entries = header.split(",").slice(0, MAX_LANGUAGE_RANGES);

  for (const [position, entry] of entries.entries()) {
    const [rawRange, ...rawParameters] = entry.trim().split(";");
    const range = rawRange?.trim();
    if (range === undefined || range.length === 0) {
      continue;
    }

    let quality = 1;
    let valid = true;
    for (const rawParameter of rawParameters) {
      const match = /^q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.exec(rawParameter.trim());
      if (match === null) {
        valid = false;
        break;
      }
      quality = Number(match[1]);
    }

    if (!valid) {
      continue;
    }

    parsed.push({ range, quality, position });
  }

  return parsed.sort((left, right) => right.quality - left.quality || left.position - right.position);
}

export function negotiateUiLocale(
  acceptLanguage: string | null | undefined,
  fallback: UiLocale = "en-US",
): UiLocale {
  return matchAcceptLanguage(acceptLanguage, fallback).locale;
}

interface AcceptLanguageMatch {
  readonly locale: UiLocale;
  readonly matchedRange: string | null;
}

interface EffectiveLanguageRange extends LanguageRange {
  readonly locale: UiLocale;
  readonly specificity: number;
}

function languageRangeSpecificity(range: string): number {
  const canonical = canonicalizeBcp47(range);
  if (canonical === null) return 0;
  return new Intl.Locale(canonical).baseName.split("-").length;
}

function matchAcceptLanguage(
  acceptLanguage: string | null | undefined,
  fallback: UiLocale,
): AcceptLanguageMatch {
  const candidates = parseAcceptLanguage(acceptLanguage);
  const effective: EffectiveLanguageRange[] = [];

  for (const locale of UI_LOCALES) {
    let governing: EffectiveLanguageRange | null = null;
    for (const candidate of candidates) {
      const matchedLocale = candidate.range === "*" ? locale : matchUiLocale(candidate.range);
      if (matchedLocale !== locale) continue;
      const match: EffectiveLanguageRange = {
        ...candidate,
        locale,
        specificity: candidate.range === "*" ? 0 : languageRangeSpecificity(candidate.range),
      };
      if (
        governing === null
        || match.specificity > governing.specificity
        || (
          match.specificity === governing.specificity
          && (
            match.quality > governing.quality
            || (match.quality === governing.quality && match.position < governing.position)
          )
        )
      ) {
        governing = match;
      }
    }
    if (governing !== null) effective.push(governing);
  }

  const accepted = effective
    .filter((candidate) => candidate.quality > 0)
    .sort((left, right) => (
      right.quality - left.quality
      || left.position - right.position
      || Number(right.locale === fallback) - Number(left.locale === fallback)
      || UI_LOCALES.indexOf(left.locale) - UI_LOCALES.indexOf(right.locale)
    ))[0];
  if (accepted !== undefined) {
    return { locale: accepted.locale, matchedRange: accepted.range };
  }

  const excluded = new Set(
    effective.filter((candidate) => candidate.quality === 0).map((candidate) => candidate.locale),
  );
  const safeFallback = excluded.has(fallback)
    ? UI_LOCALES.find((locale) => !excluded.has(locale)) ?? fallback
    : fallback;
  return { locale: safeFallback, matchedRange: null };
}

export type LocaleResolutionSource =
  | "explicit"
  | "device"
  | "membership"
  | "user"
  | "organization"
  | "accept-language"
  | "fallback";

export interface LocaleResolutionInput {
  readonly explicit?: string | null;
  readonly device?: string | null;
  readonly membership?: string | null;
  readonly user?: string | null;
  readonly organization?: string | null;
  readonly acceptLanguage?: string | null;
  readonly fallback?: UiLocale;
}

export interface ResolvedLocale {
  readonly locale: UiLocale;
  readonly direction: TextDirection;
  readonly source: LocaleResolutionSource;
  readonly matchedInput?: string;
}

const PREFERENCE_SOURCES = [
  "explicit",
  "device",
  "membership",
  "user",
  "organization",
] as const;

export function resolveUiLocale(input: LocaleResolutionInput): ResolvedLocale {
  for (const source of PREFERENCE_SOURCES) {
    const candidate = input[source];
    const locale = matchUiLocale(candidate);
    if (locale !== null) {
      return {
        locale,
        direction: getTextDirection(locale),
        source,
        ...(candidate === null || candidate === undefined ? {} : { matchedInput: candidate }),
      };
    }
  }

  const fallback = input.fallback ?? "en-US";
  const acceptLanguageMatch = matchAcceptLanguage(input.acceptLanguage, fallback);
  if (acceptLanguageMatch.matchedRange !== null) {
    return {
      locale: acceptLanguageMatch.locale,
      direction: getTextDirection(acceptLanguageMatch.locale),
      source: "accept-language",
      matchedInput: acceptLanguageMatch.matchedRange,
    };
  }
  return {
    locale: acceptLanguageMatch.locale,
    direction: getTextDirection(acceptLanguageMatch.locale),
    source: "fallback",
  };
}

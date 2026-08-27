import {
  buildIntlLocale,
  getLocaleDefinition,
  getTextDirection,
  type CalendarId,
  type NumberingSystem,
  type TextDirection,
  type UiLocale,
} from "./locale-registry.js";

export interface FormatContext {
  readonly uiLocale: UiLocale;
  readonly formatLocale: string;
  readonly intlLocale: string;
  readonly direction: TextDirection;
  readonly calendar: CalendarId;
  readonly numberingSystem: NumberingSystem;
  readonly timeZone: string;
}

export interface CreateFormatContextOptions {
  readonly formatLocale?: string;
  readonly calendar?: CalendarId;
  readonly numberingSystem?: NumberingSystem;
  readonly timeZone?: string;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function createFormatContext(
  uiLocale: UiLocale,
  options: CreateFormatContextOptions = {},
): FormatContext {
  const definition = getLocaleDefinition(uiLocale);
  const formatLocale = options.formatLocale ?? definition.defaultFormatLocale;
  const calendar = options.calendar ?? definition.defaultCalendar;
  const numberingSystem = options.numberingSystem ?? definition.defaultNumberingSystem;
  const timeZone = options.timeZone ?? "UTC";

  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid IANA time zone: ${timeZone}`);
  }

  return Object.freeze({
    uiLocale,
    formatLocale,
    intlLocale: buildIntlLocale(uiLocale, { formatLocale, calendar, numberingSystem }),
    direction: getTextDirection(uiLocale),
    calendar,
    numberingSystem,
    timeZone,
  });
}

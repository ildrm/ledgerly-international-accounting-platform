import type { FormatContext } from "./format-context.js";

declare const isoBusinessDateBrand: unique symbol;
export type IsoBusinessDate = string & { readonly [isoBusinessDateBrand]: true };
declare const persianBusinessDateBrand: unique symbol;
export type PersianBusinessDate = string & { readonly [persianBusinessDateBrand]: true };

const DAY_MILLISECONDS = 86_400_000;
const PERSIAN_CALENDAR = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

export type BusinessDateFormatOptions = Omit<
  Intl.DateTimeFormatOptions,
  "calendar" | "numberingSystem" | "timeZone"
>;

export type InstantFormatOptions = Omit<
  Intl.DateTimeFormatOptions,
  "calendar" | "numberingSystem" | "timeZone"
>;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

export function parseIsoBusinessDate(input: string): IsoBusinessDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input);
  if (match === null) {
    throw new RangeError("Business date must use canonical Gregorian YYYY-MM-DD form");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Invalid Gregorian business date: ${input}`);
  }
  return input as IsoBusinessDate;
}

function businessDateToUtcDate(input: IsoBusinessDate): Date {
  const [yearText, monthText, dayText] = input.split("-");
  const value = new Date(0);
  value.setUTCFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
  value.setUTCHours(12, 0, 0, 0);
  return value;
}

type CalendarDateParts = Readonly<{ year: number; month: number; day: number }>;

function utcEpochForCivilDate(year: number, month: number, day: number): number {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(12, 0, 0, 0);
  return value.getTime();
}

function persianParts(epochMilliseconds: number): CalendarDateParts {
  const parts = PERSIAN_CALENDAR.formatToParts(new Date(epochMilliseconds));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (![year, month, day].every(Number.isInteger)) {
    throw new RangeError("The runtime cannot produce Persian calendar date parts");
  }
  return { year, month, day };
}

function compareCalendarParts(left: CalendarDateParts, right: CalendarDateParts): -1 | 0 | 1 {
  if (left.year !== right.year) return left.year < right.year ? -1 : 1;
  if (left.month !== right.month) return left.month < right.month ? -1 : 1;
  if (left.day !== right.day) return left.day < right.day ? -1 : 1;
  return 0;
}

function parsePersianParts(input: string): CalendarDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input);
  if (match === null) {
    throw new RangeError("Persian business date must use canonical YYYY-MM-DD form");
  }
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts.year < 1 || parts.year > 9_378 || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    throw new RangeError(`Invalid Persian business date: ${input}`);
  }
  return parts;
}

function findGregorianEpochForPersianDate(target: CalendarDateParts): number | null {
  let lower = Math.floor(utcEpochForCivilDate(target.year + 620, 1, 1) / DAY_MILLISECONDS);
  let upper = Math.floor(utcEpochForCivilDate(target.year + 623, 1, 1) / DAY_MILLISECONDS);
  while (lower <= upper) {
    const midpoint = Math.floor((lower + upper) / 2);
    const comparison = compareCalendarParts(persianParts(midpoint * DAY_MILLISECONDS), target);
    if (comparison === 0) return midpoint * DAY_MILLISECONDS;
    if (comparison < 0) lower = midpoint + 1;
    else upper = midpoint - 1;
  }
  return null;
}

export function gregorianToPersianBusinessDate(input: string): PersianBusinessDate {
  const gregorian = parseIsoBusinessDate(input);
  const parts = persianParts(businessDateToUtcDate(gregorian).getTime());
  if (parts.year < 1 || parts.year > 9_999) {
    throw new RangeError(`Gregorian date is outside the supported positive Persian era: ${input}`);
  }
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}` as PersianBusinessDate;
}

export function persianToGregorianBusinessDate(input: string): IsoBusinessDate {
  const target = parsePersianParts(input);
  const epoch = findGregorianEpochForPersianDate(target);
  if (epoch === null) throw new RangeError(`Invalid Persian business date: ${input}`);
  const value = new Date(epoch);
  const year = value.getUTCFullYear();
  const canonical = `${String(year).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  return parseIsoBusinessDate(canonical);
}

export function parsePersianBusinessDate(input: string): PersianBusinessDate {
  persianToGregorianBusinessDate(input);
  return input as PersianBusinessDate;
}

export function formatBusinessDateToParts(
  input: string,
  context: FormatContext,
  options: BusinessDateFormatOptions = {},
): readonly Intl.DateTimeFormatPart[] {
  const date = businessDateToUtcDate(parseIsoBusinessDate(input));
  const formatter = new Intl.DateTimeFormat(context.intlLocale, {
    year: options.year ?? "numeric",
    month: options.month ?? "2-digit",
    day: options.day ?? "2-digit",
    ...options,
    calendar: context.calendar,
    numberingSystem: context.numberingSystem,
    timeZone: "UTC",
  });
  return formatter.formatToParts(date);
}

export function formatBusinessDate(
  input: string,
  context: FormatContext,
  options: BusinessDateFormatOptions = {},
): string {
  return formatBusinessDateToParts(input, context, options)
    .map((part) => part.value)
    .join("");
}

function parseInstant(input: string | Date): Date {
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) {
      throw new RangeError("Invalid instant");
    }
    return new Date(input.getTime());
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([zZ]|([+-])(\d{2}):(\d{2}))$/u.exec(input);
  if (match === null) {
    throw new RangeError("Instant must be a strict RFC 3339 timestamp with Z or an explicit UTC offset");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const offsetSign = match[9];
  const offsetHour = Number(match[10] ?? "0");
  const offsetMinute = Number(match[11] ?? "0");

  if (
    year < 1
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59
  ) {
    throw new RangeError("Invalid RFC 3339 instant");
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, Number(fraction.slice(0, 3).padEnd(3, "0")));
  const offsetDirection = offsetSign === "+" ? 1 : offsetSign === "-" ? -1 : 0;
  const offsetMilliseconds = offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000;
  const instant = new Date(local.getTime() - offsetMilliseconds);
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError("Invalid RFC 3339 instant");
  }
  return instant;
}

export function formatInstant(
  input: string | Date,
  context: FormatContext,
  options: InstantFormatOptions = {},
): string {
  const formatter = new Intl.DateTimeFormat(context.intlLocale, {
    dateStyle: options.dateStyle ?? "medium",
    timeStyle: options.timeStyle ?? "short",
    ...options,
    calendar: context.calendar,
    numberingSystem: context.numberingSystem,
    timeZone: context.timeZone,
  });
  return formatter.format(parseInstant(input));
}

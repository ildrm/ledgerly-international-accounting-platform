import { fail } from "./errors.js";

declare const businessDateBrand: unique symbol;

export type BusinessDate = string & {
  readonly [businessDateBrand]: "BusinessDate";
};

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

export function businessDate(value: string): BusinessDate {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (match === null) {
    fail("INVALID_BUSINESS_DATE", "Business dates must use YYYY-MM-DD.", { value });
  }

  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    fail("INVALID_BUSINESS_DATE", "Business date parsing failed.", { value });
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    fail("INVALID_BUSINESS_DATE", "Business date is not a valid Gregorian calendar date.", {
      value,
    });
  }

  return value as BusinessDate;
}

export function compareBusinessDates(left: BusinessDate, right: BusinessDate): -1 | 0 | 1 {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isBusinessDateInRange(
  value: BusinessDate,
  start: BusinessDate,
  end: BusinessDate,
): boolean {
  return compareBusinessDates(value, start) >= 0 && compareBusinessDates(value, end) <= 0;
}

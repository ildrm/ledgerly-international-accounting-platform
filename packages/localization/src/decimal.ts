import type { FormatContext } from "./format-context.js";

declare const canonicalDecimalBrand: unique symbol;
export type CanonicalDecimal = string & { readonly [canonicalDecimalBrand]: true };

export interface DecimalConstraints {
  readonly allowNegative?: boolean;
  readonly maxIntegerDigits?: number;
  readonly maxFractionDigits?: number;
}

export interface ParseLocalizedDecimalOptions extends DecimalConstraints {
  readonly allowParentheses?: boolean;
  readonly allowLeadingPlus?: boolean;
  readonly acceptAsciiDecimalWhenUnambiguous?: boolean;
}

export interface FormatDecimalOptions {
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean;
  readonly signDisplay?: Intl.NumberFormatOptions["signDisplay"];
  readonly allowPresentationRounding?: boolean;
}

export class DecimalValueError extends RangeError {
  public constructor(message: string) {
    super(message);
    this.name = "DecimalValueError";
  }
}

const CANONICAL_DECIMAL_PATTERN = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SAFE_EDGE_DIRECTIONAL_MARKS = /[\u061c\u200e\u200f]/gu;
const SAFE_EDGE_DIRECTIONAL_MARK = /[\u061c\u200e\u200f]/u;
const BIDI_SPOOFING_CONTROLS = /[\u202a-\u202e\u2066-\u206f]/u;
const SPACE_GROUP_CHARACTERS = /[\u0020\u00a0\u202f]/gu;
const MAX_SUPPORTED_FRACTION_DIGITS = 20;

const COMMON_DECIMAL_DIGITS: ReadonlyMap<string, string> = new Map(
  [
    ...[..."0123456789"].map((digit) => [digit, digit] as const),
    ...[..."٠١٢٣٤٥٦٧٨٩"].map((digit, index) => [digit, String(index)] as const),
    ...[..."۰۱۲۳۴۵۶۷۸۹"].map((digit, index) => [digit, String(index)] as const),
  ],
);

interface ExactNumberFormat {
  format(value: string | number | bigint): string;
  formatToParts(value: string | number | bigint): Intl.NumberFormatPart[];
}

function asExactNumberFormat(formatter: Intl.NumberFormat): ExactNumberFormat {
  return formatter as unknown as ExactNumberFormat;
}

function assertExactStringFormattingSupport(): void {
  const probe = "9007199254740993";
  const formatter = asExactNumberFormat(
    new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 0 }),
  );
  if (formatter.format(probe) !== probe) {
    throw new Error("This runtime cannot format decimal strings without precision loss");
  }
}

let exactStringFormattingVerified = false;

function ensureExactStringFormattingSupport(): void {
  if (!exactStringFormattingVerified) {
    assertExactStringFormattingSupport();
    exactStringFormattingVerified = true;
  }
}

function assertDigitLimit(name: string, value: number, maximum: number): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new DecimalValueError(`${name} must be an integer between 0 and ${maximum}`);
  }
}

export function parseCanonicalDecimal(
  input: string,
  constraints: DecimalConstraints = {},
): CanonicalDecimal {
  if (!CANONICAL_DECIMAL_PATTERN.test(input)) {
    throw new DecimalValueError("Decimal value must use the canonical form 1234.56");
  }

  const negative = input.startsWith("-");
  if (negative && constraints.allowNegative === false) {
    throw new DecimalValueError("Negative values are not allowed");
  }

  const unsigned = input.startsWith("-") || input.startsWith("+") ? input.slice(1) : input;
  const [rawInteger = "0", fraction] = unsigned.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/u, "");
  const maxIntegerDigits = constraints.maxIntegerDigits ?? 38;
  const maxFractionDigits = constraints.maxFractionDigits ?? 18;
  assertDigitLimit("maxIntegerDigits", maxIntegerDigits, 1_000);
  assertDigitLimit("maxFractionDigits", maxFractionDigits, MAX_SUPPORTED_FRACTION_DIGITS);

  if (integer.length > maxIntegerDigits) {
    throw new DecimalValueError(`Decimal value exceeds ${maxIntegerDigits} integer digits`);
  }
  if ((fraction?.length ?? 0) > maxFractionDigits) {
    throw new DecimalValueError(`Decimal value exceeds ${maxFractionDigits} fractional digits`);
  }

  const isZero = /^0+$/u.test(integer) && (fraction === undefined || /^0+$/u.test(fraction));
  const sign = negative && !isZero ? "-" : "";
  return `${sign}${integer}${fraction === undefined ? "" : `.${fraction}`}` as CanonicalDecimal;
}

interface NumberSymbols {
  readonly decimal: string;
  readonly group: string;
  readonly minus: string;
  readonly plus: string;
  readonly digits: ReadonlyMap<string, string>;
  readonly primaryGroupSize: number;
  readonly secondaryGroupSize: number;
}

function partValue(parts: readonly Intl.NumberFormatPart[], type: Intl.NumberFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function getNumberSymbols(context: FormatContext): NumberSymbols {
  const formatter = asExactNumberFormat(
    new Intl.NumberFormat(context.intlLocale, {
      useGrouping: true,
      signDisplay: "always",
      maximumFractionDigits: 2,
    }),
  );
  const parts = formatter.formatToParts("-123456789012345.6");
  const integerParts = parts.filter((part) => part.type === "integer").map((part) => [...part.value].length);
  const primaryGroupSize = integerParts.at(-1) ?? 3;
  const secondaryGroupSize = integerParts.at(-2) ?? primaryGroupSize;

  const digits = new Map<string, string>(COMMON_DECIMAL_DIGITS);
  const digitFormatter = asExactNumberFormat(
    new Intl.NumberFormat(context.intlLocale, { useGrouping: false, maximumFractionDigits: 0 }),
  );
  for (let digit = 0; digit <= 9; digit += 1) {
    const localized = digitFormatter.format(String(digit)).replace(SAFE_EDGE_DIRECTIONAL_MARKS, "");
    digits.set(localized, String(digit));
  }

  const positiveParts = formatter.formatToParts("1");
  return {
    decimal: partValue(parts, "decimal") || ".",
    group: partValue(parts, "group") || ",",
    minus: partValue(parts, "minusSign") || "-",
    plus: partValue(positiveParts, "plusSign") || "+",
    digits,
    primaryGroupSize,
    secondaryGroupSize,
  };
}

function normalizeDigits(value: string, digitMap: ReadonlyMap<string, string>): string {
  let normalized = "";
  for (const character of value) {
    normalized += digitMap.get(character) ?? character;
  }
  return normalized;
}

function removeExpectedEdgeDirectionalMarks(input: string): string {
  if (BIDI_SPOOFING_CONTROLS.test(input)) {
    throw new DecimalValueError("Number contains a bidi spoofing control character");
  }

  let value = input.trim();
  while (value.length > 0 && SAFE_EDGE_DIRECTIONAL_MARK.test(value[0] ?? "")) {
    value = value.slice(1).trimStart();
  }
  while (value.length > 0 && SAFE_EDGE_DIRECTIONAL_MARK.test(value.at(-1) ?? "")) {
    value = value.slice(0, -1).trimEnd();
  }
  if (SAFE_EDGE_DIRECTIONAL_MARK.test(value)) {
    throw new DecimalValueError("Number contains an embedded directional mark");
  }
  return value;
}

function validateAndRemoveGrouping(value: string, symbols: NumberSymbols): string {
  const groupIsSpace = SPACE_GROUP_CHARACTERS.test(symbols.group);
  SPACE_GROUP_CHARACTERS.lastIndex = 0;
  const normalized = groupIsSpace ? value.replace(SPACE_GROUP_CHARACTERS, symbols.group) : value;
  const groups = normalized.split(symbols.group);

  if (groups.length === 1) {
    if (!/^\d+$/u.test(normalized)) {
      throw new DecimalValueError("Number contains a character that is not valid for this locale");
    }
    return normalized;
  }

  if (groups.some((group) => group.length === 0 || !/^\d+$/u.test(group))) {
    throw new DecimalValueError("Number contains invalid grouping separators");
  }

  const first = groups[0];
  const last = groups.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    first.length > symbols.secondaryGroupSize ||
    last.length !== symbols.primaryGroupSize
  ) {
    throw new DecimalValueError("Number contains invalid digit grouping");
  }

  for (const middle of groups.slice(1, -1)) {
    if (middle.length !== symbols.secondaryGroupSize) {
      throw new DecimalValueError("Number contains invalid digit grouping");
    }
  }

  return groups.join("");
}

export function parseLocalizedDecimal(
  input: string,
  context: FormatContext,
  options: ParseLocalizedDecimalOptions = {},
): CanonicalDecimal {
  const symbols = getNumberSymbols(context);
  let value = removeExpectedEdgeDirectionalMarks(input);
  if (value.length === 0) {
    throw new DecimalValueError("Decimal value is empty");
  }

  let negative = false;
  if (options.allowParentheses !== false && value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1).trim();
  }

  if (value.startsWith(symbols.minus) || value.startsWith("-")) {
    negative = true;
    value = value.slice(value.startsWith(symbols.minus) ? symbols.minus.length : 1);
  } else if (value.startsWith(symbols.plus) || value.startsWith("+")) {
    if (options.allowLeadingPlus !== true) {
      throw new DecimalValueError("A leading plus sign is not allowed");
    }
    value = value.slice(value.startsWith(symbols.plus) ? symbols.plus.length : 1);
  }

  if (negative && options.allowNegative === false) {
    throw new DecimalValueError("Negative values are not allowed");
  }

  value = normalizeDigits(value, symbols.digits);
  const decimalSeparators = [symbols.decimal];
  if (
    options.acceptAsciiDecimalWhenUnambiguous !== false &&
    symbols.decimal !== "." &&
    symbols.group !== "."
  ) {
    decimalSeparators.push(".");
  }

  const usedSeparators = decimalSeparators.filter((separator) => value.includes(separator));
  if (usedSeparators.length > 1) {
    throw new DecimalValueError("Number uses more than one decimal separator style");
  }
  const decimalSeparator = usedSeparators[0];
  const segments = decimalSeparator === undefined ? [value] : value.split(decimalSeparator);
  if (segments.length > 2) {
    throw new DecimalValueError("Number contains more than one decimal separator");
  }

  const integerSegment = segments[0];
  const fraction = segments[1];
  if (integerSegment === undefined || integerSegment.length === 0) {
    throw new DecimalValueError("Number must contain an integer part");
  }
  if (fraction !== undefined && (fraction.length === 0 || !/^\d+$/u.test(fraction))) {
    throw new DecimalValueError("Number contains an invalid fractional part");
  }

  const integer = validateAndRemoveGrouping(integerSegment, symbols);
  const canonical = `${negative ? "-" : ""}${integer}${fraction === undefined ? "" : `.${fraction}`}`;
  return parseCanonicalDecimal(canonical, options);
}

function decimalScale(value: CanonicalDecimal): number {
  return value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
}

export function formatDecimalToParts(
  input: string,
  context: FormatContext,
  options: FormatDecimalOptions = {},
): readonly Intl.NumberFormatPart[] {
  ensureExactStringFormattingSupport();
  const decimal = parseCanonicalDecimal(input, { maxFractionDigits: MAX_SUPPORTED_FRACTION_DIGITS });
  const scale = decimalScale(decimal);
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? Math.max(scale, minimumFractionDigits);
  assertDigitLimit("minimumFractionDigits", minimumFractionDigits, MAX_SUPPORTED_FRACTION_DIGITS);
  assertDigitLimit("maximumFractionDigits", maximumFractionDigits, MAX_SUPPORTED_FRACTION_DIGITS);
  if (minimumFractionDigits > maximumFractionDigits) {
    throw new DecimalValueError("minimumFractionDigits cannot exceed maximumFractionDigits");
  }
  if (scale > maximumFractionDigits && options.allowPresentationRounding !== true) {
    throw new DecimalValueError("Formatting would hide decimal precision; opt in to presentation rounding");
  }

  const formatter = asExactNumberFormat(
    new Intl.NumberFormat(context.intlLocale, {
      style: "decimal",
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping: options.useGrouping ?? true,
      signDisplay: options.signDisplay ?? "auto",
    }),
  );
  return formatter.formatToParts(decimal);
}

export function formatDecimal(
  input: string,
  context: FormatContext,
  options: FormatDecimalOptions = {},
): string {
  return formatDecimalToParts(input, context, options)
    .map((part) => part.value)
    .join("");
}

export const DECIMAL_LIMITS = Object.freeze({
  maximumSupportedFractionDigits: MAX_SUPPORTED_FRACTION_DIGITS,
});

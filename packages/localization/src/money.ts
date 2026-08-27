import { parseCanonicalDecimal, type CanonicalDecimal } from "./decimal.js";
import type { FormatContext } from "./format-context.js";

export interface Money {
  readonly amount: string;
  readonly currency: string;
  readonly scale: number;
}

export interface FormatMoneyOptions {
  readonly currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
  readonly currencySign?: "standard" | "accounting";
  readonly useGrouping?: boolean;
  readonly signDisplay?: Intl.NumberFormatOptions["signDisplay"];
}

interface ExactNumberFormat {
  formatToParts(value: string | number | bigint): Intl.NumberFormatPart[];
}

function validateMoney(money: Money): CanonicalDecimal {
  if (!/^[A-Z]{3}$/u.test(money.currency)) {
    throw new RangeError("Currency must be an uppercase three-letter ISO 4217 code");
  }
  if (!Number.isInteger(money.scale) || money.scale < 0 || money.scale > 12) {
    throw new RangeError("Money scale must be an integer between 0 and 12");
  }
  return parseCanonicalDecimal(money.amount, { maxFractionDigits: money.scale });
}

export function formatMoneyToParts(
  money: Money,
  context: FormatContext,
  options: FormatMoneyOptions = {},
): readonly Intl.NumberFormatPart[] {
  const amount = validateMoney(money);
  const formatter = new Intl.NumberFormat(context.intlLocale, {
    style: "currency",
    currency: money.currency,
    currencyDisplay: options.currencyDisplay ?? "symbol",
    currencySign: options.currencySign ?? "standard",
    minimumFractionDigits: money.scale,
    maximumFractionDigits: money.scale,
    useGrouping: options.useGrouping ?? true,
    signDisplay: options.signDisplay ?? "auto",
  }) as unknown as ExactNumberFormat;
  return formatter.formatToParts(amount);
}

export function formatMoney(
  money: Money,
  context: FormatContext,
  options: FormatMoneyOptions = {},
): string {
  return formatMoneyToParts(money, context, options)
    .map((part) => part.value)
    .join("");
}

export function convertIrrToToman(irrAmount: string): CanonicalDecimal {
  const amount = parseCanonicalDecimal(irrAmount, { maxFractionDigits: 18 });
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [integer = "0", fraction = ""] = unsigned.split(".");
  const digits = `${integer}${fraction}`;
  const decimalPosition = integer.length - 1;
  const shifted =
    decimalPosition > 0
      ? `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`
      : `0.${"0".repeat(Math.abs(decimalPosition))}${digits}`;
  const trimmed = shifted.replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
  return parseCanonicalDecimal(`${negative ? "-" : ""}${trimmed}`, { maxFractionDigits: 19 });
}

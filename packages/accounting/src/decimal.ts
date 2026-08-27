import { AccountingError, fail } from "./errors.js";

export type RoundingMode =
  | "down"
  | "up"
  | "floor"
  | "ceiling"
  | "half-up"
  | "half-even";

export const MAX_DECIMAL_SCALE = 38;
export const MAX_DECIMAL_DIGITS = 100;

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const POWERS_OF_TEN: bigint[] = [1n];

function powerOfTen(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_DECIMAL_SCALE * 2) {
    fail("DECIMAL_LIMIT_EXCEEDED", "Decimal scale exceeds the supported limit.", {
      exponent: String(exponent),
    });
  }

  for (let index = POWERS_OF_TEN.length; index <= exponent; index += 1) {
    const previous = POWERS_OF_TEN[index - 1];
    if (previous === undefined) {
      fail("INVALID_DECIMAL", "Decimal power table is internally inconsistent.");
    }
    POWERS_OF_TEN.push(previous * 10n);
  }

  const result = POWERS_OF_TEN[exponent];
  if (result === undefined) {
    fail("INVALID_DECIMAL", "Decimal power could not be calculated.");
  }
  return result;
}

function digitCount(value: bigint): number {
  const absolute = value < 0n ? -value : value;
  return absolute.toString().length;
}

function signOf(value: bigint): bigint {
  return value < 0n ? -1n : 1n;
}

function roundedQuotient(
  numerator: bigint,
  denominatorInput: bigint,
  mode: RoundingMode,
): bigint {
  if (denominatorInput === 0n) {
    fail("DIVISION_BY_ZERO", "Division by zero is not allowed.");
  }

  const denominator = denominatorInput < 0n ? -denominatorInput : denominatorInput;
  const adjustedNumerator = denominatorInput < 0n ? -numerator : numerator;
  const quotient = adjustedNumerator / denominator;
  const remainder = adjustedNumerator % denominator;
  if (remainder === 0n) return quotient;

  const direction = signOf(adjustedNumerator);
  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  let increment = false;

  switch (mode) {
    case "down":
      increment = false;
      break;
    case "up":
      increment = true;
      break;
    case "floor":
      increment = adjustedNumerator < 0n;
      break;
    case "ceiling":
      increment = adjustedNumerator > 0n;
      break;
    case "half-up":
      increment = absoluteRemainder * 2n >= denominator;
      break;
    case "half-even": {
      const doubled = absoluteRemainder * 2n;
      const absoluteQuotient = quotient < 0n ? -quotient : quotient;
      increment = doubled > denominator || (doubled === denominator && absoluteQuotient % 2n === 1n);
      break;
    }
  }

  return increment ? quotient + direction : quotient;
}

function normalize(coefficientInput: bigint, scaleInput: number): readonly [bigint, number] {
  if (!Number.isInteger(scaleInput) || scaleInput < 0) {
    fail("INVALID_DECIMAL", "Decimal scale must be a non-negative integer.", {
      scale: String(scaleInput),
    });
  }

  let coefficient = coefficientInput;
  let scale = scaleInput;
  if (coefficient === 0n) return [0n, 0] as const;

  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }

  if (scale > MAX_DECIMAL_SCALE || digitCount(coefficient) > MAX_DECIMAL_DIGITS) {
    fail("DECIMAL_LIMIT_EXCEEDED", "Decimal precision or scale exceeds the supported limit.", {
      digits: String(digitCount(coefficient)),
      scale: String(scale),
    });
  }

  return [coefficient, scale] as const;
}

export class Decimal {
  readonly #coefficient: bigint;
  readonly #scale: number;

  private constructor(coefficientInput: bigint, scaleInput: number) {
    const [coefficient, scale] = normalize(coefficientInput, scaleInput);
    this.#coefficient = coefficient;
    this.#scale = scale;
    Object.freeze(this);
  }

  static parse(value: string | bigint | Decimal): Decimal {
    if (value instanceof Decimal) return value;
    if (typeof value === "bigint") return new Decimal(value, 0);
    if (typeof value !== "string") {
      fail("INVALID_DECIMAL", "Decimals must be created from a string or bigint.");
    }

    const match = DECIMAL_PATTERN.exec(value);
    if (match === null) {
      fail("INVALID_DECIMAL", "Decimal text must use an optional sign and base-10 digits.", {
        value,
      });
    }

    const sign = match[1] === "-" ? -1n : 1n;
    const whole = match[2];
    const fraction = match[3] ?? "";
    if (whole === undefined || whole.length + fraction.length > MAX_DECIMAL_DIGITS + MAX_DECIMAL_SCALE) {
      fail("DECIMAL_LIMIT_EXCEEDED", "Decimal input is too large.");
    }

    return new Decimal(sign * BigInt(`${whole}${fraction}`), fraction.length);
  }

  static zero(): Decimal {
    return new Decimal(0n, 0);
  }

  get decimalPlaces(): number {
    return this.#scale;
  }

  plus(otherInput: Decimal | string | bigint): Decimal {
    const other = Decimal.parse(otherInput);
    const commonScale = Math.max(this.#scale, other.#scale);
    const left = this.#coefficient * powerOfTen(commonScale - this.#scale);
    const right = other.#coefficient * powerOfTen(commonScale - other.#scale);
    return new Decimal(left + right, commonScale);
  }

  minus(otherInput: Decimal | string | bigint): Decimal {
    return this.plus(Decimal.parse(otherInput).negated());
  }

  multipliedBy(otherInput: Decimal | string | bigint): Decimal {
    const other = Decimal.parse(otherInput);
    return new Decimal(this.#coefficient * other.#coefficient, this.#scale + other.#scale);
  }

  dividedBy(
    divisorInput: Decimal | string | bigint,
    resultScale: number,
    roundingMode: RoundingMode,
  ): Decimal {
    if (!Number.isInteger(resultScale) || resultScale < 0 || resultScale > MAX_DECIMAL_SCALE) {
      fail("DECIMAL_LIMIT_EXCEEDED", "Division result scale is outside the supported range.", {
        resultScale: String(resultScale),
      });
    }

    const divisor = Decimal.parse(divisorInput);
    if (divisor.#coefficient === 0n) {
      fail("DIVISION_BY_ZERO", "Division by zero is not allowed.");
    }

    const exponent = divisor.#scale - this.#scale + resultScale;
    const numerator = exponent >= 0
      ? this.#coefficient * powerOfTen(exponent)
      : this.#coefficient;
    const denominator = exponent >= 0
      ? divisor.#coefficient
      : divisor.#coefficient * powerOfTen(-exponent);

    return new Decimal(roundedQuotient(numerator, denominator, roundingMode), resultScale);
  }

  quantize(resultScale: number, roundingMode: RoundingMode): Decimal {
    if (!Number.isInteger(resultScale) || resultScale < 0 || resultScale > MAX_DECIMAL_SCALE) {
      fail("DECIMAL_LIMIT_EXCEEDED", "Quantization scale is outside the supported range.", {
        resultScale: String(resultScale),
      });
    }
    if (resultScale >= this.#scale) return this;

    const denominator = powerOfTen(this.#scale - resultScale);
    return new Decimal(roundedQuotient(this.#coefficient, denominator, roundingMode), resultScale);
  }

  compare(otherInput: Decimal | string | bigint): -1 | 0 | 1 {
    const difference = this.minus(otherInput);
    if (difference.#coefficient < 0n) return -1;
    if (difference.#coefficient > 0n) return 1;
    return 0;
  }

  equals(otherInput: Decimal | string | bigint): boolean {
    return this.compare(otherInput) === 0;
  }

  isZero(): boolean {
    return this.#coefficient === 0n;
  }

  isPositive(): boolean {
    return this.#coefficient > 0n;
  }

  isNegative(): boolean {
    return this.#coefficient < 0n;
  }

  negated(): Decimal {
    return new Decimal(-this.#coefficient, this.#scale);
  }

  absolute(): Decimal {
    return this.#coefficient < 0n ? this.negated() : this;
  }

  toFixed(scale: number, roundingMode: RoundingMode = "half-even"): string {
    if (!Number.isInteger(scale) || scale < 0 || scale > MAX_DECIMAL_SCALE) {
      fail("DECIMAL_LIMIT_EXCEEDED", "Fixed decimal scale is outside the supported range.", {
        scale: String(scale),
      });
    }

    const value = this.quantize(scale, roundingMode);
    const negative = value.#coefficient < 0n;
    const absoluteDigits = (negative ? -value.#coefficient : value.#coefficient).toString();
    const padded = absoluteDigits.padStart(value.#scale + 1, "0");
    const wholeLength = padded.length - value.#scale;
    const whole = padded.slice(0, wholeLength);
    const fraction = padded.slice(wholeLength).padEnd(scale, "0");
    const sign = negative ? "-" : "";
    return scale === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
  }

  toString(): string {
    return this.toFixed(this.#scale, "down");
  }

  toJSON(): string {
    return this.toString();
  }
}

export function isAccountingError(value: unknown): value is AccountingError {
  return value instanceof AccountingError;
}

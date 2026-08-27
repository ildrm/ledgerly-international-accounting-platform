import { Decimal, type RoundingMode } from "./decimal.js";
import { fail } from "./errors.js";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export class Currency {
  readonly code: string;
  readonly minorUnit: number;

  constructor(codeInput: string, minorUnit: number) {
    const code = codeInput.trim().toUpperCase();
    if (!CURRENCY_CODE_PATTERN.test(code) || !Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 12) {
      fail("INVALID_CURRENCY", "Currency requires an uppercase three-letter code and a scale from 0 to 12.", {
        code,
        minorUnit: String(minorUnit),
      });
    }
    this.code = code;
    this.minorUnit = minorUnit;
    Object.freeze(this);
  }

  equals(other: Currency): boolean {
    return this.code === other.code && this.minorUnit === other.minorUnit;
  }
}

export interface MoneyJson {
  readonly amount: string;
  readonly currency: string;
  readonly scale: number;
}

export class Money {
  readonly amount: Decimal;
  readonly currency: Currency;

  private constructor(amount: Decimal, currency: Currency) {
    this.amount = amount;
    this.currency = currency;
    Object.freeze(this);
  }

  static exact(amountInput: Decimal | string | bigint, currency: Currency): Money {
    const amount = Decimal.parse(amountInput);
    const quantized = amount.quantize(currency.minorUnit, "down");
    if (!amount.equals(quantized)) {
      fail("MONEY_SCALE_MISMATCH", "Money has more fractional digits than the currency permits.", {
        amount: amount.toString(),
        currency: currency.code,
        minorUnit: String(currency.minorUnit),
      });
    }
    return new Money(amount, currency);
  }

  static rounded(
    amountInput: Decimal | string | bigint,
    currency: Currency,
    roundingMode: RoundingMode,
  ): Money {
    return new Money(Decimal.parse(amountInput).quantize(currency.minorUnit, roundingMode), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(Decimal.zero(), currency);
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  multipliedBy(factor: Decimal | string | bigint, roundingMode: RoundingMode): Money {
    return Money.rounded(this.amount.multipliedBy(factor), this.currency, roundingMode);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.amount.compare(other.amount);
  }

  equals(other: Money): boolean {
    return this.currency.equals(other.currency) && this.amount.equals(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  negated(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  absolute(): Money {
    return this.amount.isNegative() ? this.negated() : this;
  }

  toString(): string {
    return `${this.amount.toFixed(this.currency.minorUnit)} ${this.currency.code}`;
  }

  toJSON(): MoneyJson {
    return Object.freeze({
      amount: this.amount.toFixed(this.currency.minorUnit),
      currency: this.currency.code,
      scale: this.currency.minorUnit,
    });
  }

  private assertSameCurrency(other: Money): void {
    if (!this.currency.equals(other.currency)) {
      fail("CURRENCY_MISMATCH", "Money values use different currencies.", {
        left: this.currency.code,
        right: other.currency.code,
      });
    }
  }
}

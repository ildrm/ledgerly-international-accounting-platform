import { businessDate, compareBusinessDates, type BusinessDate } from "./business-date.js";
import { Decimal, type RoundingMode } from "./decimal.js";
import { fail } from "./errors.js";
import { Currency, Money } from "./money.js";

export type ExchangeRateSourceKind =
  | "manual"
  | "imported"
  | "official"
  | "market"
  | "historical"
  | "consolidation";

export interface ExchangeRateSource {
  readonly kind: ExchangeRateSourceKind;
  readonly provider: string;
  readonly reference: string;
}

export interface ExchangeRateInput {
  readonly id: string;
  readonly fromCurrency: Currency;
  readonly toCurrency: Currency;
  /** Target-currency units received for exactly one source-currency unit. */
  readonly rate: string | Decimal;
  readonly rateDate: string | BusinessDate;
  readonly source: ExchangeRateSource;
}

export class ExchangeRate {
  readonly id: string;
  readonly fromCurrency: Currency;
  readonly toCurrency: Currency;
  readonly rate: Decimal;
  readonly rateDate: BusinessDate;
  readonly source: ExchangeRateSource;

  constructor(input: ExchangeRateInput) {
    const id = input.id.trim();
    const provider = input.source.provider.trim();
    const reference = input.source.reference.trim();
    const rate = Decimal.parse(input.rate);
    if (id.length === 0 || id.length > 160 || provider.length === 0 || provider.length > 160 || reference.length === 0 || reference.length > 240) {
      fail("INVALID_EXCHANGE_RATE", "Exchange-rate identity and provenance are required and length-limited.");
    }
    if (input.fromCurrency.equals(input.toCurrency) || !rate.isPositive() || rate.decimalPlaces > 18) {
      fail("INVALID_EXCHANGE_RATE", "Exchange rates require different currencies and a positive rate with at most 18 decimals.", {
        fromCurrency: input.fromCurrency.code,
        toCurrency: input.toCurrency.code,
        rate: rate.toString(),
      });
    }
    this.id = id;
    this.fromCurrency = input.fromCurrency;
    this.toCurrency = input.toCurrency;
    this.rate = rate;
    this.rateDate = businessDate(input.rateDate);
    this.source = Object.freeze({ kind: input.source.kind, provider, reference });
    Object.freeze(this);
  }
}

export interface FxConversion {
  readonly sourceAmount: Money;
  readonly convertedAmount: Money;
  readonly exactConvertedAmount: Decimal;
  readonly roundingDifference: Decimal;
  readonly exchangeRateId: string;
  readonly rate: string;
  readonly rateDate: BusinessDate;
  readonly rateSource: ExchangeRateSource;
}

export function convertMoneyAtRate(
  amount: Money,
  targetCurrency: Currency,
  exchangeRate: ExchangeRate,
  roundingMode: RoundingMode,
): FxConversion {
  if (!amount.currency.equals(exchangeRate.fromCurrency) || !targetCurrency.equals(exchangeRate.toCurrency)) {
    fail("EXCHANGE_RATE_PAIR_MISMATCH", "The exchange-rate direction must match the source and target money currencies.", {
      amountCurrency: amount.currency.code,
      rateFromCurrency: exchangeRate.fromCurrency.code,
      targetCurrency: targetCurrency.code,
      rateToCurrency: exchangeRate.toCurrency.code,
    });
  }
  const exactConvertedAmount = amount.amount.multipliedBy(exchangeRate.rate);
  const convertedAmount = Money.rounded(exactConvertedAmount, targetCurrency, roundingMode);
  return Object.freeze({
    sourceAmount: amount,
    convertedAmount,
    exactConvertedAmount,
    roundingDifference: convertedAmount.amount.minus(exactConvertedAmount),
    exchangeRateId: exchangeRate.id,
    rate: exchangeRate.rate.toString(),
    rateDate: exchangeRate.rateDate,
    rateSource: exchangeRate.source,
  });
}

export class ExchangeRateTable {
  readonly #rates: readonly ExchangeRate[];

  constructor(rates: readonly ExchangeRate[] = []) {
    const identifiers = new Set<string>();
    for (const rate of rates) {
      if (identifiers.has(rate.id)) fail("INVALID_EXCHANGE_RATE", "Exchange-rate identifiers must be unique.", { id: rate.id });
      identifiers.add(rate.id);
    }
    this.#rates = Object.freeze([...rates]);
    Object.freeze(this);
  }

  withRate(rate: ExchangeRate): ExchangeRateTable {
    return new ExchangeRateTable([...this.#rates, rate]);
  }

  findHistorical(
    fromCurrency: Currency,
    toCurrency: Currency,
    onOrBeforeInput: string | BusinessDate,
    acceptedSources?: readonly ExchangeRateSourceKind[],
  ): ExchangeRate {
    const onOrBefore = businessDate(onOrBeforeInput);
    const accepted = acceptedSources ? new Set(acceptedSources) : null;
    const match = this.#rates
      .filter((rate) => rate.fromCurrency.equals(fromCurrency)
        && rate.toCurrency.equals(toCurrency)
        && compareBusinessDates(rate.rateDate, onOrBefore) <= 0
        && (accepted === null || accepted.has(rate.source.kind)))
      .sort((left, right) => compareBusinessDates(right.rateDate, left.rateDate))[0];
    if (!match) {
      fail("EXCHANGE_RATE_NOT_FOUND", "No eligible historical exchange rate exists on or before the requested date.", {
        fromCurrency: fromCurrency.code,
        toCurrency: toCurrency.code,
        onOrBefore,
      });
    }
    return match;
  }

  get rates(): readonly ExchangeRate[] {
    return this.#rates;
  }
}

export type FxExposureNature = "asset" | "liability";
export type FxDifferenceKind = "realized" | "unrealized";

export interface FxDifferenceInput {
  readonly kind: FxDifferenceKind;
  readonly exposureNature: FxExposureNature;
  readonly foreignAmount: Money;
  readonly carryingBaseAmount: Money;
  readonly valuationRate: ExchangeRate;
  readonly roundingMode: RoundingMode;
}

export interface FxDifference {
  readonly kind: FxDifferenceKind;
  readonly exposureNature: FxExposureNature;
  readonly carryingBaseAmount: Money;
  readonly valuedBaseAmount: Money;
  readonly gain: Money;
  readonly loss: Money;
  readonly conversion: FxConversion;
}

export function calculateFxDifference(input: FxDifferenceInput): FxDifference {
  if (input.foreignAmount.isNegative() || input.carryingBaseAmount.isNegative()) {
    fail("INVALID_FX_EXPOSURE", "FX exposure and carrying amounts must be non-negative.");
  }
  const conversion = convertMoneyAtRate(
    input.foreignAmount,
    input.carryingBaseAmount.currency,
    input.valuationRate,
    input.roundingMode,
  );
  const valuationDelta = conversion.convertedAmount.minus(input.carryingBaseAmount);
  const economicGain = input.exposureNature === "asset" ? valuationDelta : valuationDelta.negated();
  const zero = Money.zero(input.carryingBaseAmount.currency);
  return Object.freeze({
    kind: input.kind,
    exposureNature: input.exposureNature,
    carryingBaseAmount: input.carryingBaseAmount,
    valuedBaseAmount: conversion.convertedAmount,
    gain: economicGain.isPositive() ? economicGain : zero,
    loss: economicGain.isNegative() ? economicGain.absolute() : zero,
    conversion,
  });
}

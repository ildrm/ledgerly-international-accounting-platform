import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AccountingError,
  Currency,
  ExchangeRate,
  ExchangeRateTable,
  Money,
  calculateFxDifference,
  convertMoneyAtRate,
} from "../dist/index.js";

const eur = new Currency("EUR", 2);
const usd = new Currency("USD", 2);

function rate(id: string, value: string, rateDate: string, kind: "manual" | "imported" = "imported"): ExchangeRate {
  return new ExchangeRate({
    id,
    fromCurrency: eur,
    toCurrency: usd,
    rate: value,
    rateDate,
    source: { kind, provider: kind === "manual" ? "Finance team" : "ECB adapter", reference: id },
  });
}

describe("multi-currency valuation", () => {
  it("selects an explicit historical rate without using a future observation", () => {
    const table = new ExchangeRateTable([
      rate("rate-2026-01-01", "1.10", "2026-01-01"),
      rate("rate-2026-01-15", "1.12", "2026-01-15"),
      rate("rate-2026-02-01", "1.20", "2026-02-01"),
    ]);
    assert.equal(table.findHistorical(eur, usd, "2026-01-20").id, "rate-2026-01-15");
    assert.throws(
      () => table.findHistorical(eur, usd, "2025-12-31"),
      (error) => error instanceof AccountingError && error.code === "EXCHANGE_RATE_NOT_FOUND",
    );
  });

  it("returns exact conversion provenance and an explicit rounding difference", () => {
    const conversion = convertMoneyAtRate(Money.exact("1.00", eur), usd, rate("fractional", "1.005", "2026-01-15"), "half-even");
    assert.equal(conversion.convertedAmount.toString(), "1.00 USD");
    assert.equal(conversion.exactConvertedAmount.toString(), "1.005");
    assert.equal(conversion.roundingDifference.toString(), "-0.005");
    assert.deepEqual(conversion.rateSource, { kind: "imported", provider: "ECB adapter", reference: "fractional" });
  });

  it("classifies realized asset appreciation as gain and payable appreciation as loss", () => {
    const foreignAmount = Money.exact("100.00", eur);
    const carryingAmount = Money.exact("110.00", usd);
    const settlementRate = rate("settlement", "1.20", "2026-02-20", "manual");
    const receivable = calculateFxDifference({
      kind: "realized", exposureNature: "asset", foreignAmount, carryingBaseAmount: carryingAmount,
      valuationRate: settlementRate, roundingMode: "half-even",
    });
    const payable = calculateFxDifference({
      kind: "realized", exposureNature: "liability", foreignAmount, carryingBaseAmount: carryingAmount,
      valuationRate: settlementRate, roundingMode: "half-even",
    });
    assert.equal(receivable.gain.toString(), "10.00 USD");
    assert.equal(receivable.loss.toString(), "0.00 USD");
    assert.equal(payable.gain.toString(), "0.00 USD");
    assert.equal(payable.loss.toString(), "10.00 USD");
  });

  it("uses the same calculation for auditable unrealized revaluation", () => {
    const result = calculateFxDifference({
      kind: "unrealized",
      exposureNature: "asset",
      foreignAmount: Money.exact("100.00", eur),
      carryingBaseAmount: Money.exact("110.00", usd),
      valuationRate: rate("closing", "1.05", "2026-03-31"),
      roundingMode: "half-even",
    });
    assert.equal(result.kind, "unrealized");
    assert.equal(result.loss.toString(), "5.00 USD");
  });
});

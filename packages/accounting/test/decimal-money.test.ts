import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AccountingError, Currency, Decimal, Money } from "../dist/index.js";

function errorCode(expected: string): (error: unknown) => boolean {
  return (error) => error instanceof AccountingError && error.code === expected;
}

describe("exact decimal and money arithmetic", () => {
  it("does not pass financial values through binary floating point", () => {
    const result = Decimal.parse("9007199254740993.10")
      .plus("0.20")
      .multipliedBy("3");
    assert.equal(result.toString(), "27021597764222979.9");
  });

  it("supports explicit half-even and half-up rounding", () => {
    assert.equal(Decimal.parse("2.345").quantize(2, "half-even").toFixed(2), "2.34");
    assert.equal(Decimal.parse("2.345").quantize(2, "half-up").toFixed(2), "2.35");
    assert.equal(Decimal.parse("2.355").quantize(2, "half-even").toFixed(2), "2.36");
  });

  it("rejects an implicit loss of monetary scale", () => {
    const usd = new Currency("USD", 2);
    assert.throws(() => Money.exact("1.001", usd), errorCode("MONEY_SCALE_MISMATCH"));
    assert.equal(Money.rounded("1.005", usd, "half-even").toString(), "1.00 USD");
    assert.equal(Money.rounded("1.005", usd, "half-up").toString(), "1.01 USD");
  });

  it("prevents arithmetic across currencies", () => {
    const usd = Money.exact("10.00", new Currency("USD", 2));
    const eur = Money.exact("10.00", new Currency("EUR", 2));
    assert.throws(() => usd.plus(eur), errorCode("CURRENCY_MISMATCH"));
  });

  it("serializes the explicit currency scale for localization and API contracts", () => {
    const value = Money.exact("12.30", new Currency("USD", 2));
    assert.deepEqual(value.toJSON(), {
      amount: "12.30",
      currency: "USD",
      scale: 2,
    });
  });

  it("uses the same three-letter currency and 0..12 scale contract as persistence and localization", () => {
    assert.throws(() => new Currency("USDT", 2), errorCode("INVALID_CURRENCY"));
    assert.throws(() => new Currency("USD", 13), errorCode("INVALID_CURRENCY"));
    assert.equal(new Currency("XAU", 12).minorUnit, 12);
  });
});

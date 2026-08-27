import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UI_LOCALES,
  assertSafeIdentifier,
  createFormatContext,
  detectTextDirection,
  formatBusinessDate,
  formatDecimal,
  formatInstant,
  formatMoney,
  gregorianToPersianBusinessDate,
  getTextDirection,
  isolateBidi,
  matchUiLocale,
  negotiateUiLocale,
  parseAcceptLanguage,
  parseLocalizedDecimal,
  parsePersianBusinessDate,
  persianToGregorianBusinessDate,
  resolveUiLocale,
} from "../dist/index.js";
import {
  DASHBOARD_CATALOGS,
  NAVIGATION_KEYS,
  RUNTIME_CATALOGS,
  assertCatalogParity,
  assertRuntimeCatalogParity,
} from "../dist/catalogs/index.js";

describe("internationalization contract", () => {
  it("contains exactly the eleven required canonical UI locales", () => {
    assert.deepEqual(UI_LOCALES, [
      "en-US", "fa-IR", "de-DE", "tr-TR", "ar-SA", "ru-RU",
      "fr-FR", "es-ES", "it-IT", "zh-Hans-CN", "ja-JP",
    ]);
  });

  it("keeps every dashboard catalog structurally complete", () => {
    assert.doesNotThrow(assertCatalogParity);
    for (const locale of UI_LOCALES) {
      assert.ok(DASHBOARD_CATALOGS[locale].commandCenter.length > 0);
      assert.equal(Object.keys(DASHBOARD_CATALOGS[locale].navigation).length, NAVIGATION_KEYS.length);
      assert.ok(Object.isFrozen(DASHBOARD_CATALOGS[locale]));
      assert.ok(Object.isFrozen(DASHBOARD_CATALOGS[locale].navigation));
    }
    assert.equal(DASHBOARD_CATALOGS["en-US"].company, "No company selected");
    assert.equal(DASHBOARD_CATALOGS["en-US"].period, "No fiscal period selected");
    assert.throws(() => {
      DASHBOARD_CATALOGS["en-US"].navigation.home = "Changed";
    }, TypeError);
  });

  it("keeps every runtime access catalog structurally complete", () => {
    assert.doesNotThrow(assertRuntimeCatalogParity);
    for (const locale of UI_LOCALES) {
      for (const [key, value] of Object.entries(RUNTIME_CATALOGS[locale])) {
        assert.ok(value.trim().length > 0, `${locale}.runtime.${key} must not be empty`);
      }
      assert.ok(Object.isFrozen(RUNTIME_CATALOGS[locale]));
    }
  });

  it("marks Persian and Arabic as RTL and every other UI as LTR", () => {
    for (const locale of UI_LOCALES) {
      assert.equal(getTextDirection(locale), locale === "fa-IR" || locale === "ar-SA" ? "rtl" : "ltr");
    }
  });

  it("matches safe language aliases without accepting Traditional Chinese", () => {
    assert.equal(matchUiLocale("de-CH"), "de-DE");
    assert.equal(matchUiLocale("fa_AF"), "fa-IR");
    assert.equal(matchUiLocale("zh-SG"), "zh-Hans-CN");
    assert.equal(matchUiLocale("zh-Hant-TW"), null);
    assert.equal(matchUiLocale("not-a-locale"), null);
  });

  it("resolves explicit, stored, browser, then fallback preference in order", () => {
    assert.deepEqual(resolveUiLocale({ explicit: "ar", user: "de" }), {
      locale: "ar-SA", direction: "rtl", source: "explicit", matchedInput: "ar",
    });
    assert.equal(resolveUiLocale({ acceptLanguage: "es-MX;q=0.8,fr-FR;q=0.9" }).locale, "fr-FR");
    assert.equal(resolveUiLocale({ acceptLanguage: "xx" }).locale, "en-US");
  });

  it("keeps UI language independent from formatting locale and calendar", () => {
    const context = createFormatContext("en-US", {
      formatLocale: "fa-IR",
      calendar: "persian",
      numberingSystem: "arabext",
      timeZone: "Asia/Tehran",
    });
    assert.equal(context.uiLocale, "en-US");
    assert.equal(context.direction, "ltr");
    assert.match(context.intlLocale, /ca-persian/u);
    assert.match(formatBusinessDate("2026-08-26", context), /۱۴۰۵/u);
  });

  it("reversibly converts Gregorian and Jalali business dates across leap boundaries", () => {
    assert.equal(gregorianToPersianBusinessDate("2026-08-26"), "1405-06-04");
    assert.equal(persianToGregorianBusinessDate("1405-06-04"), "2026-08-26");
    assert.equal(gregorianToPersianBusinessDate("2021-03-20"), "1399-12-30");
    assert.equal(persianToGregorianBusinessDate("1399-12-30"), "2021-03-20");
    assert.equal(parsePersianBusinessDate("1400-12-29"), "1400-12-29");
    assert.throws(() => parsePersianBusinessDate("1400-12-30"), /Invalid Persian business date/u);
  });

  it("formats the exact shared money DTO and enforces the persisted scale ceiling", () => {
    const context = createFormatContext("en-US");
    assert.match(formatMoney({ amount: "12.30", currency: "USD", scale: 2 }, context), /12\.30/u);
    assert.throws(
      () => formatMoney({ amount: "1", currency: "USDT", scale: 2 }, context),
      /three-letter ISO 4217/u,
    );
    assert.throws(
      () => formatMoney({ amount: "1", currency: "USD", scale: 13 }, context),
      /between 0 and 12/u,
    );
  });

  it("parses localized digits to exact canonical decimal strings", () => {
    const persian = createFormatContext("fa-IR");
    const arabic = createFormatContext("ar-SA");
    assert.equal(parseLocalizedDecimal("۱۲٬۳۴۵٫۶۷", persian), "12345.67");
    assert.equal(parseLocalizedDecimal("١٢٬٣٤٥٫٦٧", arabic), "12345.67");
    assert.equal(parseLocalizedDecimal("١٢٬٣٤٥٫٦٧", persian), "12345.67");
    assert.equal(parseLocalizedDecimal("۱۲٬۳۴۵٫۶۷", arabic), "12345.67");
    const formatted = formatDecimal("9007199254740993.10", persian, { minimumFractionDigits: 2 });
    assert.equal(parseLocalizedDecimal(formatted, persian), "9007199254740993.10");
    const negativeArabic = formatDecimal("-1234.50", arabic, { minimumFractionDigits: 2 });
    assert.equal(parseLocalizedDecimal(negativeArabic, arabic), "-1234.50");
  });

  it("rejects invisible direction controls in identifiers", () => {
    assert.equal(assertSafeIdentifier("INV-2026-001"), "INV-2026-001");
    assert.throws(() => assertSafeIdentifier("INV-\u202e100"), /directional control/u);
  });

  it("rejects bidi controls inside isolated text and localized numbers", () => {
    const persian = createFormatContext("fa-IR");
    assert.throws(() => isolateBidi("INV-\u2069100", "ltr"), /bidi control/u);
    assert.throws(
      () => parseLocalizedDecimal("۱۲\u2066۳", persian),
      /bidi spoofing control/u,
    );
    assert.throws(
      () => parseLocalizedDecimal("۱\u200f۲", persian),
      /embedded directional mark/u,
    );
    assert.equal(detectTextDirection("١ USD"), "ltr");
  });

  it("strictly rejects normalized or incomplete RFC 3339 instants", () => {
    const context = createFormatContext("en-US", { timeZone: "UTC" });
    assert.throws(() => formatInstant("2026-02-30T00:00:00Z", context), /Invalid RFC 3339/u);
    assert.throws(() => formatInstant("2026-08-26 12:00:00Z", context), /strict RFC 3339/u);
    assert.doesNotThrow(() => formatInstant("2026-08-26T12:00:00.123456+03:30", context));
  });

  it("keeps q=0 language exclusions during Accept-Language negotiation", () => {
    assert.deepEqual(parseAcceptLanguage("en;q=0"), [{ range: "en", quality: 0, position: 0 }]);
    assert.equal(negotiateUiLocale("en;q=0,*;q=1", "en-US"), "fa-IR");
    assert.equal(negotiateUiLocale("en;q=0,en-US;q=1", "de-DE"), "en-US");
    assert.equal(
      resolveUiLocale({ acceptLanguage: "en;q=0,*;q=1", fallback: "en-US" }).locale,
      "fa-IR",
    );
  });
});

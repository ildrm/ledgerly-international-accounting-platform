import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UI_LOCALES, getTextDirection } from '@ledgerly/localization';
import {
  DASHBOARD_CATALOGS,
  NAVIGATION_KEYS,
  RUNTIME_CATALOGS,
  assertCatalogParity,
  assertRuntimeCatalogParity,
} from '@ledgerly/localization/catalogs';

describe('multilingual dashboard contract', () => {
  it('ships complete non-empty copy for every required locale', () => {
    assert.doesNotThrow(assertCatalogParity);
    assert.equal(UI_LOCALES.length, 11);
    for (const locale of UI_LOCALES) {
      const catalog = DASHBOARD_CATALOGS[locale];
      for (const [key, value] of Object.entries(catalog)) {
        if (key === 'navigation') continue;
        assert.ok(value.trim().length > 0, `${locale}.${key} must not be empty`);
      }
      for (const key of NAVIGATION_KEYS) assert.ok(catalog.navigation[key].trim().length > 0);
    }
  });

  it('ships complete runtime access copy for every required locale', () => {
    assert.doesNotThrow(assertRuntimeCatalogParity);
    for (const locale of UI_LOCALES) {
      for (const [key, value] of Object.entries(RUNTIME_CATALOGS[locale])) {
        assert.ok(value.trim().length > 0, `${locale}.runtime.${key} must not be empty`);
      }
    }
  });

  it('has RTL metadata only for Persian and Arabic', () => {
    assert.equal(getTextDirection('fa-IR'), 'rtl');
    assert.equal(getTextDirection('ar-SA'), 'rtl');
    for (const locale of UI_LOCALES.filter((item) => item !== 'fa-IR' && item !== 'ar-SA')) {
      assert.equal(getTextDirection(locale), 'ltr');
    }
  });
});

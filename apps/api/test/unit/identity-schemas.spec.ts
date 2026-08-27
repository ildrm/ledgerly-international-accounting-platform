import { describe, expect, it } from 'vitest';
import { localizationPreferenceSchema, registerSchema, supportedLocales } from '../../src/identity/identity.schemas';

describe('identity localization schemas', () => {
  it('accepts exactly the required UI locales', () => {
    expect(supportedLocales).toEqual([
      'en-US', 'fa-IR', 'de-DE', 'tr-TR', 'ar-SA', 'ru-RU',
      'fr-FR', 'es-ES', 'it-IT', 'zh-Hans-CN', 'ja-JP',
    ]);
    for (const locale of supportedLocales) {
      expect(registerSchema.safeParse({
        email: 'Owner@Example.com', password: 'correct-horse-battery-staple', displayName: 'Owner', locale,
      }).success).toBe(true);
    }
  });

  it('models UI language independently from formatting preferences', () => {
    expect(localizationPreferenceSchema.parse({
      uiLocale: 'en-US',
      formatLocale: 'en-GB',
      timeZone: 'Asia/Tehran',
      calendar: 'persian',
      numberingSystem: 'arabext',
    })).toEqual({
      uiLocale: 'en-US', formatLocale: 'en-GB', timeZone: 'Asia/Tehran',
      calendar: 'persian', numberingSystem: 'arabext',
    });
    expect(localizationPreferenceSchema.safeParse({
      uiLocale: 'en-US', formatLocale: 'not_a_locale', timeZone: 'Mars/Olympus',
      calendar: 'gregory', numberingSystem: 'latn',
    }).success).toBe(false);
  });
});

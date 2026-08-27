import { z } from 'zod';

export const supportedLocales = [
  'en-US', 'fa-IR', 'de-DE', 'tr-TR', 'ar-SA', 'ru-RU',
  'fr-FR', 'es-ES', 'it-IT', 'zh-Hans-CN', 'ja-JP',
] as const;

function isBcp47Locale(value: string): boolean {
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const registerSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLocaleLowerCase('en-US')),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(120),
  locale: z.enum(supportedLocales).default('en-US'),
});

export const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLocaleLowerCase('en-US')),
  password: z.string().min(1).max(128),
});

export const localizationPreferenceSchema = z.object({
  uiLocale: z.enum(supportedLocales),
  formatLocale: z.string().trim().min(2).max(32).refine(isBcp47Locale, 'Invalid BCP 47 formatting locale'),
  timeZone: z.string().trim().min(1).max(100).refine(isIanaTimeZone, 'Invalid IANA time zone'),
  calendar: z.enum(['gregory', 'persian']),
  numberingSystem: z.enum(['latn', 'arab', 'arabext']),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LocalizationPreferenceInput = z.infer<typeof localizationPreferenceSchema>;

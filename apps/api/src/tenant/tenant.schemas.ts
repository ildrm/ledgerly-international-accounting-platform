import { z } from 'zod';

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  companyName: z.string().trim().min(2).max(200),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/u).transform((value) => value.toUpperCase()),
  baseCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/u).transform((value) => value.toUpperCase()),
  timeZone: z.string().trim().min(1).max(100).refine(isIanaTimeZone, 'Invalid IANA time zone'),
  defaultLocale: z.enum(['en-US', 'fa-IR', 'de-DE', 'tr-TR', 'ar-SA', 'ru-RU', 'fr-FR', 'es-ES', 'it-IT', 'zh-Hans-CN', 'ja-JP']),
  fiscalPeriod: z.object({
    name: z.string().trim().min(2).max(80),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  }).refine((period) => period.startDate <= period.endDate, {
    path: ['endDate'],
    message: 'Fiscal period end must be on or after its start',
  }),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

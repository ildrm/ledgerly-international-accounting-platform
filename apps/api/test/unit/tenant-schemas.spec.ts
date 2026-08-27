import { describe, expect, it } from 'vitest';
import { createTenantSchema } from '../../src/tenant/tenant.schemas';

const valid = {
  name: 'Northstar Workspace',
  slug: 'northstar-workspace',
  companyName: 'Northstar Trading LLC',
  countryCode: 'us',
  baseCurrency: 'usd',
  timeZone: 'America/New_York',
  defaultLocale: 'en-US',
  fiscalPeriod: { name: 'FY 2026', startDate: '2026-01-01', endDate: '2026-12-31' },
} as const;

describe('tenant onboarding schema', () => {
  it('requires explicit canonical fiscal bounds and normalizes codes', () => {
    expect(createTenantSchema.parse(valid)).toMatchObject({ countryCode: 'US', baseCurrency: 'USD' });
  });

  it('rejects guessed/invalid timezone and reversed fiscal periods', () => {
    expect(createTenantSchema.safeParse({ ...valid, timeZone: 'UTC+3:30' }).success).toBe(false);
    expect(createTenantSchema.safeParse({
      ...valid,
      fiscalPeriod: { name: 'Bad year', startDate: '2026-12-31', endDate: '2026-01-01' },
    }).success).toBe(false);
  });
});

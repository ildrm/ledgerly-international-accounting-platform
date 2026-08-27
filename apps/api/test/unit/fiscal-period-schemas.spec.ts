import { describe, expect, it } from 'vitest';
import {
  createFiscalPeriodSchema,
  recordCloseEvidenceSchema,
  transitionFiscalPeriodSchema,
} from '../../src/fiscal-period/fiscal-period.schemas';

const companyId = '10000000-0000-4000-8000-000000000001';
const bookId = '10000000-0000-4000-8000-000000000002';

describe('fiscal-period transport schemas', () => {
  it('accepts explicit canonical bounds and rejects overlapping-order input', () => {
    expect(createFiscalPeriodSchema.safeParse({
      companyId,
      bookId,
      name: 'FY 2027',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    }).success).toBe(true);
    expect(createFiscalPeriodSchema.safeParse({
      companyId,
      bookId,
      name: 'Invalid period',
      startDate: '2027-12-31',
      endDate: '2027-01-01',
    }).success).toBe(false);
  });

  it('requires a documented reason for every lifecycle transition', () => {
    expect(transitionFiscalPeriodSchema.safeParse({
      targetStatus: 'SOFT_CLOSED',
      reason: 'Month-end review completed',
    }).success).toBe(true);
    expect(transitionFiscalPeriodSchema.safeParse({ targetStatus: 'HARD_CLOSED', reason: '  ' }).success).toBe(false);
    expect(transitionFiscalPeriodSchema.safeParse({ targetStatus: 'ARCHIVED', reason: 'Unsupported state' }).success).toBe(false);
  });

  it('allows known or namespaced manual evidence but reserves the automated document check', () => {
    const base = { status: 'ATTESTED', reason: 'Reviewed by the responsible accountant' } as const;
    expect(recordCloseEvidenceSchema.safeParse({ ...base, checkKey: 'bank_reconciliation' }).success).toBe(true);
    expect(recordCloseEvidenceSchema.safeParse({ ...base, checkKey: 'custom.local_review' }).success).toBe(true);
    expect(recordCloseEvidenceSchema.safeParse({ ...base, checkKey: 'unposted_documents' }).success).toBe(false);
    expect(recordCloseEvidenceSchema.safeParse({ ...base, checkKey: 'invented_check' }).success).toBe(false);
  });

  it('rejects control characters in audit reasons', () => {
    expect(recordCloseEvidenceSchema.safeParse({
      checkKey: 'tax',
      status: 'BLOCKED',
      reason: 'Pending\u0000review',
    }).success).toBe(false);
  });
});

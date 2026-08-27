import { describe, expect, it } from 'vitest';
import { createJournalSchema, trialBalanceQuerySchema } from '../../src/ledger/ledger.schemas';

const accountA = '10000000-0000-4000-8000-000000000001';
const accountB = '10000000-0000-4000-8000-000000000002';

describe('ledger transport schemas', () => {
  it('requires exactly one positive side on every line', () => {
    const base = {
      companyId: accountA,
      bookId: accountB,
      businessDate: '2026-08-26',
      sourceType: 'test',
      sourceId: 'one',
      currency: 'USD',
      lines: [
        { accountId: accountA, debit: '10.00', credit: '0', transactionCurrency: 'USD', exchangeRate: '1' },
        { accountId: accountB, debit: '0', credit: '10.00', transactionCurrency: 'USD', exchangeRate: '1' },
      ],
    };
    expect(createJournalSchema.safeParse(base).success).toBe(true);
    expect(createJournalSchema.safeParse({
      ...base,
      lines: [{ ...base.lines[0], credit: '1.00' }, base.lines[1]],
    }).success).toBe(false);
  });

  it('rejects reversed report date ranges', () => {
    expect(trialBalanceQuerySchema.safeParse({
      companyId: accountA, bookId: accountB, from: '2026-12-31', to: '2026-01-01',
    }).success).toBe(false);
  });
});

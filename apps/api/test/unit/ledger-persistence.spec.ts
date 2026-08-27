import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/common/domain-error';
import { mapLedgerPersistenceError } from '../../src/ledger/ledger.service';

describe('ledger persistence error boundary', () => {
  it.each([
    ['ACCOUNTING_PERIOD_CLOSED_OR_MISSING', 'ACCOUNTING_PERIOD_CLOSED_OR_MISSING', 'business_rule'],
    ['COMPANY_OR_BOOK_NOT_ACTIVE', 'COMPANY_OR_BOOK_NOT_ACTIVE', 'business_rule'],
    ['JOURNAL_HAS_INACTIVE_OR_OUT_OF_SCOPE_ACCOUNT', 'JOURNAL_HAS_INACTIVE_OR_OUT_OF_SCOPE_ACCOUNT', 'business_rule'],
    ['JOURNAL_ACCOUNT_SCOPE_MISMATCH', 'JOURNAL_ACCOUNT_SCOPE_MISMATCH', 'validation'],
    ['POSTED_JOURNAL_LINES_IMMUTABLE', 'POSTED_JOURNAL_LINES_IMMUTABLE', 'conflict'],
  ] as const)('maps database rule %s without leaking PostgreSQL details', (message, code, kind) => {
    const mapped = mapLedgerPersistenceError({ code: '23514', message, detail: 'sensitive database detail' });
    expect(mapped).toBeInstanceOf(DomainError);
    expect(mapped).toMatchObject({ code, kind });
    expect(mapped.message).not.toContain('sensitive');
  });

  it('maps referential, uniqueness, and numeric failures to stable transport codes', () => {
    expect(mapLedgerPersistenceError({ code: '23503', message: 'foreign key', constraint: 'fk_journals_company_book' }))
      .toMatchObject({ code: 'FINANCIAL_SCOPE_INVALID', kind: 'validation', parameters: { constraint: 'fk_journals_company_book' } });
    expect(mapLedgerPersistenceError({ code: '23505', message: 'duplicate', constraint: 'uq_journals_document_number' }))
      .toMatchObject({ code: 'FINANCIAL_RECORD_CONFLICT', kind: 'conflict' });
    expect(mapLedgerPersistenceError({ code: '22003', message: 'numeric field overflow' }))
      .toMatchObject({ code: 'FINANCIAL_VALUE_OUT_OF_RANGE', kind: 'validation' });
  });

  it('preserves deliberate domain failures', () => {
    const domainError = new DomainError('business_rule', 'UNBALANCED_JOURNAL');
    expect(mapLedgerPersistenceError(domainError)).toBe(domainError);
  });
});

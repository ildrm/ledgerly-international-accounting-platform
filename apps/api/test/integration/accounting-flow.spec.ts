import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter';

type IdentityResponse = { sessionToken: string; user: { id: string; email: string; displayName: string } };
type TenantResponse = {
  tenant: { id: string; name: string; slug: string };
  membership: { id: string; role: string };
  company: { id: string; name: string; baseCurrency: string };
  book: { id: string; code: string; kind: string; baseCurrency: string };
  fiscalPeriod: { id: string; name: string; startDate: string; endDate: string; status: string };
};
type AccountResponse = { id: string; code: string; status: string };
type ExchangeRateResponse = { id: string; from_currency: string; to_currency: string; rate: string; rate_date: string };
type JournalResponse = {
  id: string; status: string; period_id: string | null; document_number: string | null;
  lines: readonly unknown[];
};
type FiscalPeriodResponse = {
  id: string; companyId: string; bookId: string; name: string; startDate: string; endDate: string;
  status: 'OPEN' | 'SOFT_CLOSED' | 'HARD_CLOSED'; closedAt: string | null; closedBy: string | null;
};
type CloseReadinessResponse = {
  periodId: string;
  periodStatus: 'OPEN' | 'SOFT_CLOSED' | 'HARD_CLOSED';
  canHardClose: boolean;
  summary: { systemPassed: number; attested: number; blocked: number; pending: number; unavailable: number };
  checks: readonly {
    key: string; availability: 'AVAILABLE' | 'UNAVAILABLE' | 'EXTERNAL';
    state: 'PASS' | 'BLOCKED' | 'PENDING' | 'ATTESTED' | 'NOT_APPLICABLE';
    automated: boolean; blocking: boolean; evidence: unknown;
  }[];
};
type FiscalPeriodHistoryResponse = {
  items: readonly {
    previousStatus: string; newStatus: string; authorizationCapability: string | null;
    authorizationMembershipId: string | null; correlationId: string | null;
    readinessSnapshot: Record<string, unknown>;
  }[];
};
type TenantListResponse = {
  items: readonly { id: string; membershipId: string; role: string; companyCount: number }[];
};
type SequenceRow = { sequence_type: string; fiscal_year: number; prefix: string; next_value: string };

const databaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://ledgerly_runtime:ledgerly_runtime_dev@localhost:5432/ledgerly';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.SESSION_PEPPER = 'ledgerly-integration-session-pepper-2026';
process.env.LOG_LEVEL = 'fatal';

let app: NestFastifyApplication;
let server: FastifyInstance;
let owner: IdentityResponse;
let outsider: IdentityResponse;
let tenant: TenantResponse;
let accounts: AccountResponse[];
let postedJournal: JournalResponse;
let managedFiscalPeriod: FiscalPeriodResponse;

const fiscalPeriod = {
  name: 'FY 2025/26',
  startDate: '2025-07-01',
  endDate: '2026-06-30',
} as const;
const journalBusinessDate = '2026-02-15';

async function request(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  options: { token?: string; tenantId?: string; idempotencyKey?: string; payload?: object } = {},
) {
  return server.inject({
    method,
    url,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.tenantId ? { 'x-tenant-id': options.tenantId } : {}),
      ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
      'x-correlation-id': randomUUID(),
    },
    ...(options.payload ? { payload: options.payload } : {}),
  });
}

async function register(label: string): Promise<IdentityResponse> {
  const suffix = randomUUID();
  const response = await request('POST', '/api/v1/identity/register', {
    payload: {
      email: `${label}.${suffix}@integration.ledgerly.test`,
      password: 'correct-horse-battery-staple-2026',
      displayName: label,
      locale: 'en-US',
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<IdentityResponse>();
}

beforeAll(async () => {
  const adapter = new FastifyAdapter({ logger: false });
  app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { logger: false });
  server = adapter.getInstance();
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  owner = await register('Owner');
  outsider = await register('Outsider');
}, 30_000);

afterAll(async () => {
  await app?.close();
});

describe.sequential('authenticated multi-tenant accounting flow', () => {
  it('persists language separately from formats, timezone, calendar, and digits', async () => {
    const update = await request('PATCH', '/api/v1/identity/me/localization', {
      token: owner.sessionToken,
      payload: {
        uiLocale: 'en-US',
        formatLocale: 'fa-IR',
        timeZone: 'Asia/Tehran',
        calendar: 'persian',
        numberingSystem: 'arabext',
      },
    });
    expect(update.statusCode, update.body).toBe(200);
    expect(update.json<unknown>()).toMatchObject({
      ui_locale: 'en-US', format_locale: 'fa-IR', time_zone: 'Asia/Tehran',
      calendar: 'persian', numbering_system: 'arabext',
    });
  });

  it('atomically onboards tenant, legal entity, statutory book, and open fiscal period', async () => {
    const suffix = randomUUID().slice(0, 8);
    const response = await request('POST', '/api/v1/tenants', {
      token: owner.sessionToken,
      payload: {
        name: `Integration Tenant ${suffix}`,
        slug: `integration-${suffix}`,
        companyName: `Integration Company ${suffix}`,
        countryCode: 'US',
        baseCurrency: 'USD',
        timeZone: 'America/New_York',
        defaultLocale: 'en-US',
        fiscalPeriod,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    tenant = response.json<TenantResponse>();
    expect(tenant).toMatchObject({
      membership: { role: 'OWNER' },
      book: { code: 'PRIMARY', kind: 'STATUTORY', baseCurrency: 'USD' },
      fiscalPeriod: { ...fiscalPeriod, status: 'OPEN' },
    });
  });

  it('denies a valid outsider session from another tenant', async () => {
    const response = await request('GET', '/api/v1/tenants/current/companies', {
      token: outsider.sessionToken,
      tenantId: tenant.tenant.id,
    });
    expect(response.statusCode, response.body).toBe(403);
    expect(response.json<unknown>()).toMatchObject({ code: 'TENANT_ACCESS_DENIED', status: 403 });
  });

  it('lists only active memberships with the RLS-safe company count', async () => {
    const response = await request('GET', '/api/v1/tenants', { token: owner.sessionToken });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<TenantListResponse>().items).toContainEqual(expect.objectContaining({
      id: tenant.tenant.id,
      membershipId: tenant.membership.id,
      role: 'OWNER',
      companyCount: 1,
    }));
  });

  it('rejects mismatched financial scope as a stable domain problem', async () => {
    const wrongCompany = await request('POST', '/api/v1/accounts', {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: {
        companyId: randomUUID(),
        bookId: tenant.book.id,
        code: 'INVALID-COMPANY',
        name: 'Must not be created',
        type: 'ASSET',
        normalBalance: 'D',
        isControl: false,
        allowPosting: true,
      },
    });
    expect(wrongCompany.statusCode, wrongCompany.body).toBe(422);
    expect(wrongCompany.json<unknown>()).toMatchObject({ code: 'COMPANY_OR_BOOK_NOT_ACTIVE', status: 422 });

    const wrongParent = await request('POST', '/api/v1/accounts', {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: {
        companyId: tenant.company.id,
        bookId: tenant.book.id,
        parentId: randomUUID(),
        code: 'INVALID-PARENT',
        name: 'Must not be created',
        type: 'ASSET',
        normalBalance: 'D',
        isControl: false,
        allowPosting: true,
      },
    });
    expect(wrongParent.statusCode, wrongParent.body).toBe(400);
    expect(wrongParent.json<unknown>()).toMatchObject({ code: 'PARENT_ACCOUNT_SCOPE_INVALID', status: 400 });
  });

  it('creates a postable chart of accounts and a balanced draft', async () => {
    const definitions = [
      { code: '1100', name: 'Accounts receivable', type: 'ASSET', normalBalance: 'D' },
      { code: '4100', name: 'Sales revenue', type: 'REVENUE', normalBalance: 'C' },
      { code: '2200', name: 'Output tax', type: 'LIABILITY', normalBalance: 'C' },
    ];
    accounts = [];
    for (const definition of definitions) {
      const response = await request('POST', '/api/v1/accounts', {
        token: owner.sessionToken,
        tenantId: tenant.tenant.id,
        payload: {
          companyId: tenant.company.id,
          bookId: tenant.book.id,
          ...definition,
          isControl: false,
          allowPosting: true,
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      accounts.push(response.json<AccountResponse>());
    }
    const [cashAccount, revenueAccount, taxAccount] = accounts;
    if (!cashAccount || !revenueAccount || !taxAccount) {
      throw new Error('Expected all three integration-test accounts to be created.');
    }

    const draft = await request('POST', '/api/v1/journals', {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: {
        companyId: tenant.company.id,
        bookId: tenant.book.id,
        businessDate: journalBusinessDate,
        description: 'Integration invoice',
        sourceType: 'INTEGRATION_TEST',
        sourceId: randomUUID(),
        currency: 'USD',
        lines: [
          { accountId: cashAccount.id, debit: '109.00', credit: '0', transactionAmount: '109.00', transactionCurrency: 'USD', exchangeRate: '1', dimensions: {} },
          { accountId: revenueAccount.id, debit: '0', credit: '100.00', transactionAmount: '-100.00', transactionCurrency: 'USD', exchangeRate: '1', dimensions: {} },
          { accountId: taxAccount.id, debit: '0', credit: '9.00', transactionAmount: '-9.00', transactionCurrency: 'USD', exchangeRate: '1', dimensions: {} },
        ],
      },
    });
    expect(draft.statusCode, draft.body).toBe(201);
    postedJournal = draft.json<JournalResponse>();
    expect(postedJournal.status).toBe('DRAFT');
    expect(Array.isArray(postedJournal.lines)).toBe(true);
  });

  it('posts exactly once under an idempotency key', async () => {
    const idempotencyKey = `post:${randomUUID()}`;
    const first = await request('POST', `/api/v1/journals/${postedJournal.id}/post`, {
      token: owner.sessionToken, tenantId: tenant.tenant.id, idempotencyKey,
    });
    expect(first.statusCode, first.body).toBe(201);
    postedJournal = first.json<JournalResponse>();
    expect(postedJournal).toMatchObject({
      status: 'POSTED',
      period_id: tenant.fiscalPeriod.id,
      document_number: 'JRN-2025-000001',
    });

    const replay = await request('POST', `/api/v1/journals/${postedJournal.id}/post`, {
      token: owner.sessionToken, tenantId: tenant.tenant.id, idempotencyKey,
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json<JournalResponse>()).toEqual(postedJournal);
  });

  it('enforces database immutability even for the runtime role', async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)", [owner.user.id, tenant.tenant.id]);
      await expect(client.query(
        "UPDATE ledger.journals SET description='tampered' WHERE tenant_id=$1 AND id=$2",
        [tenant.tenant.id, postedJournal.id],
      )).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('posts an exact reversal and reconstructs a zero ending trial balance', async () => {
    const reversal = await request('POST', `/api/v1/journals/${postedJournal.id}/reverse`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      idempotencyKey: `reverse:${randomUUID()}`,
      payload: { businessDate: journalBusinessDate, reason: 'Integration test reversal' },
    });
    expect(reversal.statusCode, reversal.body).toBe(201);
    expect(reversal.json<unknown>()).toMatchObject({
      status: 'POSTED',
      period_id: tenant.fiscalPeriod.id,
      document_number: 'REV-2025-000001',
    });

    const report = await request(
      'GET',
      `/api/v1/reports/trial-balance?companyId=${tenant.company.id}&bookId=${tenant.book.id}&from=${fiscalPeriod.startDate}&to=${fiscalPeriod.endDate}`,
      { token: owner.sessionToken, tenantId: tenant.tenant.id },
    );
    expect(report.statusCode, report.body).toBe(200);
    expect(report.json<unknown>()).toMatchObject({
      totals: { periodDebit: '218', periodCredit: '218', endingDebit: '0', endingCredit: '0' },
      provenance: { tenantId: tenant.tenant.id, companyId: tenant.company.id, bookId: tenant.book.id },
    });

    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)", [owner.user.id, tenant.tenant.id]);
      const sequences = await client.query<SequenceRow>(
        `SELECT sequence_type,fiscal_year,prefix,next_value::text
           FROM ledger.number_sequences WHERE tenant_id=$1 AND book_id=$2 ORDER BY sequence_type`,
        [tenant.tenant.id, tenant.book.id],
      );
      expect(sequences.rows).toEqual([
        { sequence_type: 'JOURNAL', fiscal_year: 2025, prefix: 'JRN-2025-', next_value: '2' },
        { sequence_type: 'REVERSAL', fiscal_year: 2025, prefix: 'REV-2025-', next_value: '2' },
      ]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('posts a foreign-currency journal only with immutable historical rate provenance', async () => {
    const createRate = await request('POST', '/api/v1/exchange-rates', {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: {
        companyId: tenant.company.id,
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        rate: '1.10',
        rateDate: journalBusinessDate,
        sourceKind: 'MANUAL',
        provider: 'Integration finance team',
        sourceReference: randomUUID(),
      },
    });
    expect(createRate.statusCode, createRate.body).toBe(201);
    const exchangeRate = createRate.json<ExchangeRateResponse>();

    const historical = await request(
      'GET',
      `/api/v1/exchange-rates/historical?companyId=${tenant.company.id}&fromCurrency=EUR&toCurrency=USD&onOrBefore=${journalBusinessDate}`,
      { token: owner.sessionToken, tenantId: tenant.tenant.id },
    );
    expect(historical.statusCode, historical.body).toBe(200);
    expect(historical.json<ExchangeRateResponse>().id).toBe(exchangeRate.id);

    const [receivableAccount, revenueAccount] = accounts;
    if (!receivableAccount || !revenueAccount) throw new Error('Expected foreign-journal accounts.');
    const draft = await request('POST', '/api/v1/journals', {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: {
        companyId: tenant.company.id,
        bookId: tenant.book.id,
        businessDate: journalBusinessDate,
        description: 'Foreign-currency integration invoice',
        sourceType: 'FX_INTEGRATION_TEST',
        sourceId: randomUUID(),
        currency: 'USD',
        lines: [
          { accountId: receivableAccount.id, debit: '110.00', credit: '0', transactionAmount: '100.00', transactionCurrency: 'EUR', exchangeRate: '1.10', exchangeRateId: exchangeRate.id, dimensions: {} },
          { accountId: revenueAccount.id, debit: '0', credit: '110.00', transactionAmount: '-100.00', transactionCurrency: 'EUR', exchangeRate: '1.10', exchangeRateId: exchangeRate.id, dimensions: {} },
        ],
      },
    });
    expect(draft.statusCode, draft.body).toBe(201);
    const foreignJournal = draft.json<JournalResponse>();
    const posted = await request('POST', `/api/v1/journals/${foreignJournal.id}/post`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      idempotencyKey: `post-fx:${randomUUID()}`,
    });
    expect(posted.statusCode, posted.body).toBe(201);
    expect(posted.json<JournalResponse>().document_number).toBe('JRN-2025-000002');
  });

  it('creates, lists, and protects a non-overlapping future fiscal period', async () => {
    const create = await request('POST', '/api/v1/fiscal-periods', {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: {
        companyId: tenant.company.id,
        bookId: tenant.book.id,
        name: 'FY 2026/27',
        startDate: '2026-07-01',
        endDate: '2027-06-30',
      },
    });
    expect(create.statusCode, create.body).toBe(201);
    managedFiscalPeriod = create.json<FiscalPeriodResponse>();
    expect(managedFiscalPeriod).toMatchObject({
      companyId: tenant.company.id,
      bookId: tenant.book.id,
      name: 'FY 2026/27',
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      status: 'OPEN',
      closedAt: null,
      closedBy: null,
    });

    const overlap = await request('POST', '/api/v1/fiscal-periods', {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: {
        companyId: tenant.company.id,
        bookId: tenant.book.id,
        name: 'Overlapping FY',
        startDate: '2027-01-01',
        endDate: '2027-12-31',
      },
    });
    expect(overlap.statusCode, overlap.body).toBe(409);
    expect(overlap.json<unknown>()).toMatchObject({ code: 'FISCAL_PERIOD_OVERLAPS', status: 409 });

    const list = await request(
      'GET',
      `/api/v1/fiscal-periods?companyId=${tenant.company.id}&bookId=${tenant.book.id}`,
      { token: owner.sessionToken, tenantId: tenant.tenant.id },
    );
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json<{ items: readonly FiscalPeriodResponse[] }>().items).toContainEqual(
      expect.objectContaining({ id: managedFiscalPeriod.id, status: 'OPEN' }),
    );

    const readiness = await request('GET', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/close-readiness`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
    });
    expect(readiness.statusCode, readiness.body).toBe(200);
    expect(readiness.json<CloseReadinessResponse>()).toMatchObject({
      periodId: managedFiscalPeriod.id,
      periodStatus: 'OPEN',
      canHardClose: false,
      summary: { systemPassed: 1, attested: 0, blocked: 0, pending: 8, unavailable: 8 },
    });
  });

  it('requires current append-only evidence before a soft-closed period can be hard-closed', async () => {
    const softClose = await request('POST', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/transitions`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: { targetStatus: 'SOFT_CLOSED', reason: 'Begin integration close controls' },
    });
    expect(softClose.statusCode, softClose.body).toBe(201);
    expect(softClose.json<FiscalPeriodResponse>()).toMatchObject({ status: 'SOFT_CLOSED' });

    const prematureHardClose = await request('POST', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/transitions`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: { targetStatus: 'HARD_CLOSED', reason: 'Attempt before close evidence exists' },
    });
    expect(prematureHardClose.statusCode, prematureHardClose.body).toBe(422);
    expect(prematureHardClose.json<unknown>()).toMatchObject({
      code: 'FISCAL_PERIOD_CLOSE_CHECKLIST_INCOMPLETE',
      status: 422,
    });

    const evidenceKeys = [
      'bank_reconciliation',
      'accounts_receivable',
      'accounts_payable',
      'inventory',
      'depreciation',
      'payroll',
      'accruals',
      'tax',
    ] as const;
    for (const checkKey of evidenceKeys) {
      const evidence = await request(
        'POST',
        `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/close-evidence`,
        {
          token: owner.sessionToken,
          tenantId: tenant.tenant.id,
          payload: {
            checkKey,
            status: 'NOT_APPLICABLE',
            reason: 'Subsystem not implemented; integration fixture has no activity for this control',
            sourceReference: `integration:${checkKey}:${randomUUID()}`,
          },
        },
      );
      expect(evidence.statusCode, evidence.body).toBe(201);
      expect(evidence.json<unknown>()).toMatchObject({ checkKey, status: 'NOT_APPLICABLE' });
    }

    const readiness = await request('GET', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/close-readiness`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
    });
    expect(readiness.statusCode, readiness.body).toBe(200);
    expect(readiness.json<CloseReadinessResponse>()).toMatchObject({
      periodStatus: 'SOFT_CLOSED',
      canHardClose: true,
      summary: { systemPassed: 1, attested: 8, blocked: 0, pending: 0, unavailable: 8 },
    });

    const hardClose = await request('POST', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/transitions`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: { targetStatus: 'HARD_CLOSED', reason: 'All close controls reviewed for integration fixture' },
    });
    expect(hardClose.statusCode, hardClose.body).toBe(201);
    expect(hardClose.json<FiscalPeriodResponse>()).toMatchObject({ status: 'HARD_CLOSED' });
  });

  it('records hard-reopen authorization and invalidates evidence from the prior close cycle', async () => {
    const reopen = await request('POST', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/transitions`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: { targetStatus: 'OPEN', reason: 'Owner-authorized integration adjustment' },
    });
    expect(reopen.statusCode, reopen.body).toBe(201);
    expect(reopen.json<FiscalPeriodResponse>()).toMatchObject({ status: 'OPEN', closedAt: null, closedBy: null });

    const history = await request('GET', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/status-history`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
    });
    expect(history.statusCode, history.body).toBe(200);
    const historyItems = history.json<FiscalPeriodHistoryResponse>().items;
    expect(historyItems).toHaveLength(3);
    expect(historyItems.map((item) => [item.previousStatus, item.newStatus])).toEqual([
      ['OPEN', 'SOFT_CLOSED'],
      ['SOFT_CLOSED', 'HARD_CLOSED'],
      ['HARD_CLOSED', 'OPEN'],
    ]);
    const hardCloseHistory = historyItems[1];
    const hardReopenHistory = historyItems[2];
    expect(hardCloseHistory?.readinessSnapshot).toMatchObject({ unsupportedChecksRequireAttestation: true });
    expect(hardReopenHistory).toMatchObject({
      authorizationCapability: 'period.reopen.hard-closed',
      authorizationMembershipId: tenant.membership.id,
    });
    expect(hardReopenHistory?.correlationId).toMatch(/^[0-9a-f-]{36}$/u);

    const reopenedReadiness = await request(
      'GET',
      `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/close-readiness`,
      { token: owner.sessionToken, tenantId: tenant.tenant.id },
    );
    expect(reopenedReadiness.statusCode, reopenedReadiness.body).toBe(200);
    const reopened = reopenedReadiness.json<CloseReadinessResponse>();
    expect(reopened).toMatchObject({
      periodStatus: 'OPEN',
      canHardClose: false,
      summary: { systemPassed: 1, attested: 0, blocked: 0, pending: 8, unavailable: 8 },
    });
    expect(reopened.checks.filter((check) => check.key !== 'unposted_documents')).toSatisfy(
      (checks: CloseReadinessResponse['checks']) => checks.every(
        (check) => check.state === 'PENDING' && check.evidence === null,
      ),
    );

    const secondSoftClose = await request('POST', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/transitions`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: { targetStatus: 'SOFT_CLOSED', reason: 'Start a second integration close cycle' },
    });
    expect(secondSoftClose.statusCode, secondSoftClose.body).toBe(201);

    const staleEvidenceHardClose = await request(
      'POST',
      `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/transitions`,
      {
        token: owner.sessionToken,
        tenantId: tenant.tenant.id,
        payload: { targetStatus: 'HARD_CLOSED', reason: 'Old evidence must not authorize this cycle' },
      },
    );
    expect(staleEvidenceHardClose.statusCode, staleEvidenceHardClose.body).toBe(422);
    expect(staleEvidenceHardClose.json<unknown>()).toMatchObject({
      code: 'FISCAL_PERIOD_CLOSE_CHECKLIST_INCOMPLETE',
      status: 422,
    });

    const cleanupReopen = await request('POST', `/api/v1/fiscal-periods/${managedFiscalPeriod.id}/transitions`, {
      token: owner.sessionToken,
      tenantId: tenant.tenant.id,
      payload: { targetStatus: 'OPEN', reason: 'Leave future integration period open' },
    });
    expect(cleanupReopen.statusCode, cleanupReopen.body).toBe(201);
  });

  it('revokes sessions on logout', async () => {
    const logout = await request('POST', '/api/v1/identity/logout', { token: outsider.sessionToken });
    expect(logout.statusCode, logout.body).toBe(201);
    const rejected = await request('GET', '/api/v1/identity/me', { token: outsider.sessionToken });
    expect(rejected.statusCode, rejected.body).toBe(401);
    expect(rejected.json<unknown>()).toMatchObject({ code: 'INVALID_SESSION' });
  });
});

import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DomainError, type DomainErrorKind } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import type { Principal } from '../identity/principal';
import type { ActiveTenant } from '../tenant/tenant-context';
import type {
  CreateAccountInput, CreateExchangeRateInput, CreateJournalInput, ExchangeRateQuery,
  PostJournalInput, ReverseJournalInput, TrialBalanceQuery,
} from './ledger.schemas';

type JournalRow = {
  id: string; tenant_id: string; company_id: string; book_id: string; business_date: string; status: string;
  period_id: string | null; description: string | null; source_type: string; source_id: string; currency: string; document_number: string | null;
};

type AccountRow = {
  id: string; company_id: string; book_id: string; parent_id: string | null; code: string; name: string;
  type: string; normal_balance: string; is_control: boolean; allow_posting: boolean; status: string;
};

type TrialBalanceRow = {
  account_id: string; code: string; name: string; type: string; normal_balance: string;
  opening_debit: string; opening_credit: string; period_debit: string; period_credit: string;
  ending_debit: string; ending_credit: string;
};

type TrialBalanceTotals = {
  openingDebit: string; openingCredit: string; periodDebit: string; periodCredit: string;
  endingDebit: string; endingCredit: string;
};

type JournalDetailRow = {
  id: string; company_id: string; book_id: string; period_id: string | null; document_number: string | null;
  business_date: string; status: string; description: string | null; source_type: string; source_id: string;
  currency: string; version: number; created_at: Date; posted_at: Date | null; posted_by: string | null;
};

type JournalLineRow = {
  id: string; line_number: number; account_id: string; description: string | null; debit: string; credit: string;
  transaction_amount: string; transaction_currency: string; exchange_rate: string; exchange_rate_id: string | null;
  dimensions: Record<string, unknown>;
};

type ExchangeRateRow = {
  id: string; company_id: string; from_currency: string; to_currency: string; rate: string; rate_date: string;
  source_kind: string; provider: string; source_reference: string; created_at: Date;
};

type PostingPeriod = Readonly<{ id: string; fiscalYear: number }>;
type DocumentSeries = Readonly<{ sequenceType: 'JOURNAL' | 'REVERSAL'; prefix: 'JRN' | 'REV' }>;

@Injectable()
export class LedgerService {
  constructor(private readonly database: DatabaseService) {}

  async createAccount(principal: Principal, tenant: ActiveTenant, correlationId: string, input: CreateAccountInput): Promise<object> {
    assertCanMaintainLedger(tenant.role);
    const id = randomUUID();
    try {
      return await this.database.tenantTransaction({ userId: principal.userId, tenantId: tenant.tenantId, correlationId }, async (client) => {
        await assertActiveCompanyBook(client, tenant.tenantId, input.companyId, input.bookId);
        if (input.parentId) {
          await assertParentAccountScope(client, tenant.tenantId, input.companyId, input.bookId, input.parentId);
        }
        const result = await client.query<AccountRow>(
          `INSERT INTO ledger.accounts (id,tenant_id,company_id,book_id,parent_id,code,name,type,normal_balance,is_control,allow_posting)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id,company_id,book_id,parent_id,code,name,type,normal_balance,is_control,allow_posting,status`,
          [id, tenant.tenantId, input.companyId, input.bookId, input.parentId ?? null, input.code, input.name, input.type, input.normalBalance, input.isControl, input.allowPosting],
        );
        await insertAudit(client, tenant.tenantId, input.companyId, principal.userId, correlationId, 'LEDGER.ACCOUNT_CREATED', 'ACCOUNT', id, { code: input.code });
        const account = result.rows[0];
        if (!account) throw new DomainError('conflict', 'ACCOUNT_CREATE_DID_NOT_RETURN_ROW');
        return account;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('conflict', 'ACCOUNT_CODE_ALREADY_EXISTS', { code: input.code });
      throw mapLedgerPersistenceError(error);
    }
  }

  async listAccounts(principal: Principal, tenant: ActiveTenant, correlationId: string, bookId: string): Promise<object> {
    return this.database.tenantTransaction({ userId: principal.userId, tenantId: tenant.tenantId, correlationId }, async (client) => {
      const result = await client.query<AccountRow>(`SELECT id,company_id,book_id,parent_id,code,name,type,normal_balance,is_control,allow_posting,status
        FROM ledger.accounts WHERE tenant_id=$1 AND book_id=$2 ORDER BY code,id LIMIT 1000`, [tenant.tenantId, bookId]);
      return { items: result.rows };
    });
  }

  async createExchangeRate(principal: Principal, tenant: ActiveTenant, correlationId: string, input: CreateExchangeRateInput): Promise<ExchangeRateRow> {
    assertCanManageFx(tenant.role);
    const id = randomUUID();
    try {
      return await this.database.tenantTransaction({ userId: principal.userId, tenantId: tenant.tenantId, correlationId }, async (client) => {
        await assertActiveCompany(client, tenant.tenantId, input.companyId);
        const result = await client.query<ExchangeRateRow>(
          `INSERT INTO ledger.exchange_rates
            (id,tenant_id,company_id,from_currency,to_currency,rate,rate_date,source_kind,provider,source_reference,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id,company_id,from_currency,to_currency,rate::text,rate_date::text,source_kind,provider,source_reference,created_at`,
          [id, tenant.tenantId, input.companyId, input.fromCurrency, input.toCurrency, input.rate, input.rateDate, input.sourceKind, input.provider, input.sourceReference, principal.userId],
        );
        const exchangeRate = result.rows[0];
        if (!exchangeRate) throw new DomainError('conflict', 'EXCHANGE_RATE_CREATE_DID_NOT_RETURN_ROW');
        await insertAudit(client, tenant.tenantId, input.companyId, principal.userId, correlationId, 'LEDGER.EXCHANGE_RATE_RECORDED', 'EXCHANGE_RATE', id, {
          fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, rateDate: input.rateDate,
          sourceKind: input.sourceKind, provider: input.provider, sourceReference: input.sourceReference,
        });
        return exchangeRate;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('conflict', 'EXCHANGE_RATE_ALREADY_RECORDED');
      throw mapLedgerPersistenceError(error);
    }
  }

  async historicalExchangeRate(principal: Principal, tenant: ActiveTenant, correlationId: string, query: ExchangeRateQuery): Promise<ExchangeRateRow> {
    return this.database.tenantTransaction({ userId: principal.userId, tenantId: tenant.tenantId, correlationId }, async (client) => {
      await assertActiveCompany(client, tenant.tenantId, query.companyId);
      const result = await client.query<ExchangeRateRow>(
        `SELECT id,company_id,from_currency,to_currency,rate::text,rate_date::text,source_kind,provider,source_reference,created_at
           FROM ledger.exchange_rates
          WHERE tenant_id=$1 AND company_id=$2 AND from_currency=$3 AND to_currency=$4 AND rate_date <= $5
          ORDER BY rate_date DESC,created_at DESC,id DESC LIMIT 1`,
        [tenant.tenantId, query.companyId, query.fromCurrency, query.toCurrency, query.onOrBefore],
      );
      const exchangeRate = result.rows[0];
      if (!exchangeRate) throw new DomainError('not_found', 'EXCHANGE_RATE_NOT_FOUND', query);
      return exchangeRate;
    });
  }

  async createDraft(principal: Principal, tenant: ActiveTenant, correlationId: string, input: CreateJournalInput): Promise<object> {
    assertCanMaintainLedger(tenant.role);
    const journalId = randomUUID();
    try {
      return await this.database.tenantTransaction({ userId: principal.userId, tenantId: tenant.tenantId, correlationId }, async (client) => {
        const baseCurrency = await assertActiveCompanyBook(client, tenant.tenantId, input.companyId, input.bookId);
        if (input.currency !== baseCurrency) {
          throw new DomainError('validation', 'JOURNAL_CURRENCY_MUST_EQUAL_BOOK_BASE', { currency: input.currency, baseCurrency });
        }
        await assertAccountsPostable(
          client,
          tenant.tenantId,
          input.companyId,
          input.bookId,
          input.lines.map((line) => line.accountId),
        );
        for (const line of input.lines) {
          await assertLineExchangeRateProvenance(client, tenant.tenantId, input.companyId, input.businessDate, baseCurrency, line);
        }
        await client.query(
          `INSERT INTO ledger.journals (id,tenant_id,company_id,book_id,business_date,description,source_type,source_id,currency,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [journalId, tenant.tenantId, input.companyId, input.bookId, input.businessDate, input.description ?? null, input.sourceType, input.sourceId, input.currency, principal.userId],
        );
        for (let index = 0; index < input.lines.length; index += 1) {
          const line = input.lines[index];
          if (!line) continue;
          const transactionAmount = line.transactionAmount ?? (new Decimal(line.debit).gt(0) ? line.debit : new Decimal(line.credit).negated().toFixed());
          await client.query(
            `INSERT INTO ledger.journal_lines
              (tenant_id,journal_id,line_number,account_id,description,debit,credit,transaction_amount,transaction_currency,exchange_rate,exchange_rate_id,dimensions)
             SELECT $1,$2,$3,a.id,$4,$5,$6,$7,$8,$9,$10,$11::jsonb
               FROM ledger.accounts a
              WHERE a.tenant_id=$1 AND a.id=$12 AND a.company_id=$13 AND a.book_id=$14 AND a.status='ACTIVE' AND a.allow_posting`,
            [tenant.tenantId, journalId, index + 1, line.description ?? null, line.debit, line.credit, transactionAmount, line.transactionCurrency, line.exchangeRate, line.exchangeRateId ?? null, JSON.stringify(line.dimensions), line.accountId, input.companyId, input.bookId],
          ).then((result) => { if (result.rowCount !== 1) throw new DomainError('validation', 'ACCOUNT_NOT_POSTABLE', { accountId: line.accountId }); });
        }
        await insertAudit(client, tenant.tenantId, input.companyId, principal.userId, correlationId, 'LEDGER.JOURNAL_DRAFT_CREATED', 'JOURNAL', journalId, { sourceType: input.sourceType, sourceId: input.sourceId });
        return this.getJournalWithinTransaction(client, tenant.tenantId, journalId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('conflict', 'DUPLICATE_JOURNAL_SOURCE', { sourceType: input.sourceType, sourceId: input.sourceId });
      throw mapLedgerPersistenceError(error);
    }
  }

  async post(principal: Principal, tenant: ActiveTenant, correlationId: string, journalId: string, idempotencyKey: string, input: PostJournalInput = {}): Promise<object> {
    assertCanPost(tenant.role);
    validateIdempotencyKey(idempotencyKey);
    const overrideReason = input.softCloseOverride?.reason ?? null;
    const requestHash = createHash('sha256').update(`POST_JOURNAL:${journalId}:${overrideReason ?? ''}`).digest('hex');
    try {
      return await this.database.tenantTransaction({ userId: principal.userId, tenantId: tenant.tenantId, correlationId }, async (client) => {
        const replay = await claimIdempotency(client, tenant.tenantId, 'POST_JOURNAL', idempotencyKey, requestHash);
        if (replay) return replay;
        const journal = await this.lockJournal(client, tenant.tenantId, journalId);
        if (journal.status === 'POSTED') throw new DomainError('conflict', 'JOURNAL_ALREADY_POSTED', { journalId });
        const postingPeriod = await resolvePostingPeriod(client, journal, journal.business_date, journal.period_id, overrideReason);
        await assertJournalAccountsPostable(client, journal);
        const totals = await client.query<{ debit: string; credit: string; line_count: number }>(
          `SELECT coalesce(sum(debit),0)::text debit,coalesce(sum(credit),0)::text credit,count(*)::int line_count
             FROM ledger.journal_lines WHERE tenant_id=$1 AND journal_id=$2`, [tenant.tenantId, journalId],
        );
        const total = totals.rows[0];
        if (!total || total.line_count < 2 || new Decimal(total.debit).lte(0) || !new Decimal(total.debit).eq(total.credit)) {
          throw new DomainError('business_rule', 'UNBALANCED_JOURNAL', { debit: total?.debit ?? '0', credit: total?.credit ?? '0' });
        }
        const documentNumber = await allocateNumber(client, journal, postingPeriod, { sequenceType: 'JOURNAL', prefix: 'JRN' });
        const updated = await client.query(
          `UPDATE ledger.journals SET status='POSTED',period_id=$5,document_number=$3,posted_by=$4,posted_at=now(),version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status IN ('DRAFT','APPROVED') RETURNING id,document_number,status,posted_at,period_id,version`,
          [tenant.tenantId, journalId, documentNumber, principal.userId, postingPeriod.id],
        );
        if (updated.rowCount !== 1) throw new DomainError('conflict', 'JOURNAL_STATE_CHANGED');
        await insertAudit(client, tenant.tenantId, journal.company_id, principal.userId, correlationId, 'LEDGER.JOURNAL_POSTED', 'JOURNAL', journalId, {
          documentNumber, total: total.debit, currency: journal.currency, fiscalPeriodId: postingPeriod.id,
          softCloseOverrideReason: overrideReason,
          softCloseOverrideCapability: overrideReason ? 'period.post.soft-closed' : null,
          authorizationMembershipId: overrideReason ? tenant.membershipId : null,
        });
        await insertOutbox(client, tenant.tenantId, 'JOURNAL', journalId, 'JournalPosted', { journalId, companyId: journal.company_id, documentNumber, fiscalPeriodId: postingPeriod.id, softCloseOverride: overrideReason !== null });
        const response = await this.getJournalWithinTransaction(client, tenant.tenantId, journalId);
        await completeIdempotency(client, tenant.tenantId, 'POST_JOURNAL', idempotencyKey, journalId, response);
        return response;
      });
    } catch (error) {
      throw mapLedgerPersistenceError(error);
    }
  }

  async reverse(principal: Principal, tenant: ActiveTenant, correlationId: string, journalId: string, idempotencyKey: string, input: ReverseJournalInput): Promise<object> {
    assertCanPost(tenant.role);
    validateIdempotencyKey(idempotencyKey);
    const overrideReason = input.softCloseOverride?.reason ?? null;
    const requestHash = createHash('sha256').update(`REVERSE_JOURNAL:${journalId}:${input.businessDate}:${input.reason}:${overrideReason ?? ''}`).digest('hex');
    try {
      return await this.database.tenantTransaction({ userId: principal.userId, tenantId: tenant.tenantId, correlationId }, async (client) => {
        const replay = await claimIdempotency(client, tenant.tenantId, 'REVERSE_JOURNAL', idempotencyKey, requestHash);
        if (replay) return replay;
        const original = await this.lockJournal(client, tenant.tenantId, journalId);
        if (original.status !== 'POSTED') throw new DomainError('business_rule', 'ONLY_POSTED_JOURNALS_CAN_BE_REVERSED');
        const existing = await client.query('SELECT reversal_journal_id FROM ledger.journal_reversals WHERE tenant_id=$1 AND original_journal_id=$2', [tenant.tenantId, journalId]);
        if (existing.rowCount) throw new DomainError('conflict', 'JOURNAL_ALREADY_REVERSED', { journalId });
        const postingPeriod = await resolvePostingPeriod(client, original, input.businessDate, null, overrideReason);
        await assertJournalAccountsPostable(client, original);
        const reversalId = randomUUID();
        await client.query(
          `INSERT INTO ledger.journals (id,tenant_id,company_id,book_id,business_date,description,source_type,source_id,currency,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,'JOURNAL_REVERSAL',$7,$8,$9)`,
          [reversalId, tenant.tenantId, original.company_id, original.book_id, input.businessDate, input.reason, journalId, original.currency, principal.userId],
        );
        await client.query(
          `INSERT INTO ledger.journal_lines (tenant_id,journal_id,line_number,account_id,description,debit,credit,transaction_amount,transaction_currency,exchange_rate,exchange_rate_id,dimensions)
           SELECT tenant_id,$3,line_number,account_id,description,credit,debit,-transaction_amount,transaction_currency,exchange_rate,exchange_rate_id,dimensions
             FROM ledger.journal_lines WHERE tenant_id=$1 AND journal_id=$2 ORDER BY line_number`,
          [tenant.tenantId, journalId, reversalId],
        );
        const reversalJournal = { ...original, id: reversalId, period_id: null, business_date: input.businessDate };
        const documentNumber = await allocateNumber(client, reversalJournal, postingPeriod, { sequenceType: 'REVERSAL', prefix: 'REV' });
        const updated = await client.query(
          `UPDATE ledger.journals SET status='POSTED',period_id=$5,document_number=$3,posted_by=$4,posted_at=now(),version=version+1
            WHERE tenant_id=$1 AND id=$2 AND status='DRAFT'`,
          [tenant.tenantId, reversalId, documentNumber, principal.userId, postingPeriod.id],
        );
        if (updated.rowCount !== 1) throw new DomainError('conflict', 'JOURNAL_STATE_CHANGED');
        await client.query(`INSERT INTO ledger.journal_reversals (tenant_id,original_journal_id,reversal_journal_id,reason,created_by) VALUES ($1,$2,$3,$4,$5)`, [tenant.tenantId, journalId, reversalId, input.reason, principal.userId]);
        await insertAudit(client, tenant.tenantId, original.company_id, principal.userId, correlationId, 'LEDGER.JOURNAL_REVERSED', 'JOURNAL', reversalId, {
          originalJournalId: journalId, documentNumber, fiscalPeriodId: postingPeriod.id,
          softCloseOverrideReason: overrideReason,
          softCloseOverrideCapability: overrideReason ? 'period.post.soft-closed' : null,
          authorizationMembershipId: overrideReason ? tenant.membershipId : null,
        });
        await insertOutbox(client, tenant.tenantId, 'JOURNAL', reversalId, 'JournalReversed', { originalJournalId: journalId, reversalJournalId: reversalId, fiscalPeriodId: postingPeriod.id });
        const response = await this.getJournalWithinTransaction(client, tenant.tenantId, reversalId);
        await completeIdempotency(client, tenant.tenantId, 'REVERSE_JOURNAL', idempotencyKey, reversalId, response);
        return response;
      });
    } catch (error) {
      throw mapLedgerPersistenceError(error);
    }
  }

  async trialBalance(principal: Principal, tenant: ActiveTenant, correlationId: string, query: TrialBalanceQuery): Promise<object> {
    return this.database.tenantTransaction({ userId: principal.userId, tenantId: tenant.tenantId, correlationId }, async (client) => {
      const result = await client.query<TrialBalanceRow>(
        `WITH activity AS (
           SELECT l.account_id,
             sum(CASE WHEN j.business_date < $4 THEN l.debit-l.credit ELSE 0 END) opening_net,
             sum(CASE WHEN j.business_date BETWEEN $4 AND $5 THEN l.debit ELSE 0 END) period_debit,
             sum(CASE WHEN j.business_date BETWEEN $4 AND $5 THEN l.credit ELSE 0 END) period_credit
           FROM ledger.journal_lines l JOIN ledger.journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
           WHERE j.tenant_id=$1 AND j.company_id=$2 AND j.book_id=$3 AND j.status='POSTED' AND j.business_date <= $5
           GROUP BY l.account_id
         ) SELECT a.id account_id,a.code,a.name,a.type,a.normal_balance,
             greatest(activity.opening_net,0)::text opening_debit,greatest(-activity.opening_net,0)::text opening_credit,
             activity.period_debit::text,activity.period_credit::text,
             greatest(activity.opening_net+activity.period_debit-activity.period_credit,0)::text ending_debit,
             greatest(-(activity.opening_net+activity.period_debit-activity.period_credit),0)::text ending_credit
           FROM activity JOIN ledger.accounts a ON a.tenant_id=$1 AND a.id=activity.account_id ORDER BY a.code,a.id`,
        [tenant.tenantId, query.companyId, query.bookId, query.from, query.to],
      );
      const totals = result.rows.reduce<TrialBalanceTotals>((sum, row) => ({
        openingDebit: new Decimal(sum.openingDebit).plus(String(row.opening_debit)).toFixed(),
        openingCredit: new Decimal(sum.openingCredit).plus(String(row.opening_credit)).toFixed(),
        periodDebit: new Decimal(sum.periodDebit).plus(String(row.period_debit)).toFixed(),
        periodCredit: new Decimal(sum.periodCredit).plus(String(row.period_credit)).toFixed(),
        endingDebit: new Decimal(sum.endingDebit).plus(String(row.ending_debit)).toFixed(),
        endingCredit: new Decimal(sum.endingCredit).plus(String(row.ending_credit)).toFixed(),
      }), { openingDebit: '0', openingCredit: '0', periodDebit: '0', periodCredit: '0', endingDebit: '0', endingCredit: '0' });
      return { provenance: { tenantId: tenant.tenantId, companyId: query.companyId, bookId: query.bookId, from: query.from, to: query.to, generatedAt: new Date().toISOString() }, rows: result.rows, totals };
    });
  }

  private async lockJournal(client: PoolClient, tenantId: string, journalId: string): Promise<JournalRow> {
    const result = await client.query<JournalRow>(`SELECT id,tenant_id,company_id,book_id,period_id,business_date::text,status,description,source_type,source_id,currency,document_number FROM ledger.journals WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, journalId]);
    const row = result.rows[0];
    if (!row) throw new DomainError('not_found', 'JOURNAL_NOT_FOUND', { journalId });
    return row;
  }

  private async getJournalWithinTransaction(client: PoolClient, tenantId: string, journalId: string): Promise<Record<string, unknown>> {
    const journalResult = await client.query<JournalDetailRow>(`SELECT id,company_id,book_id,period_id,document_number,business_date::text,status,description,source_type,source_id,currency,version,created_at,posted_at,posted_by FROM ledger.journals WHERE tenant_id=$1 AND id=$2`, [tenantId, journalId]);
    const journal = journalResult.rows[0];
    if (!journal) throw new DomainError('not_found', 'JOURNAL_NOT_FOUND', { journalId });
    const lines = await client.query<JournalLineRow>(`SELECT id,line_number,account_id,description,debit::text,credit::text,transaction_amount::text,transaction_currency,exchange_rate::text,exchange_rate_id,dimensions FROM ledger.journal_lines WHERE tenant_id=$1 AND journal_id=$2 ORDER BY line_number`, [tenantId, journalId]);
    return { ...journal, lines: lines.rows };
  }
}

function assertCanMaintainLedger(role: string): void { if (!['OWNER','ADMIN','ACCOUNTANT','BOOKKEEPER'].includes(role)) throw new DomainError('authorization', 'LEDGER_WRITE_DENIED'); }
function assertCanPost(role: string): void { if (!['OWNER','ADMIN','ACCOUNTANT'].includes(role)) throw new DomainError('authorization', 'JOURNAL_POST_DENIED'); }
function assertCanManageFx(role: string): void { if (!['OWNER','ADMIN','ACCOUNTANT'].includes(role)) throw new DomainError('authorization', 'EXCHANGE_RATE_WRITE_DENIED'); }
function validateIdempotencyKey(key: string): void { if (!/^[A-Za-z0-9._:-]{8,160}$/u.test(key)) throw new DomainError('validation', 'INVALID_IDEMPOTENCY_KEY'); }
function isUniqueViolation(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'; }

async function assertActiveCompany(client: PoolClient, tenantId: string, companyId: string): Promise<void> {
  const result = await client.query(
    `SELECT id FROM core.companies WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE' FOR SHARE`,
    [tenantId, companyId],
  );
  if (result.rowCount !== 1) throw new DomainError('business_rule', 'COMPANY_NOT_ACTIVE', { companyId });
}

async function assertActiveCompanyBook(client: PoolClient, tenantId: string, companyId: string, bookId: string): Promise<string> {
  const result = await client.query<{ base_currency: string }>(
    `SELECT book.base_currency
       FROM core.companies company
       JOIN ledger.books book
         ON book.tenant_id=company.tenant_id AND book.company_id=company.id
      WHERE company.tenant_id=$1 AND company.id=$2 AND book.id=$3
        AND company.status='ACTIVE' AND book.status='ACTIVE'
      FOR SHARE OF company,book`,
    [tenantId, companyId, bookId],
  );
  if (result.rowCount !== 1) {
    throw new DomainError('business_rule', 'COMPANY_OR_BOOK_NOT_ACTIVE', { companyId, bookId });
  }
  const baseCurrency = result.rows[0]?.base_currency;
  if (!baseCurrency) throw new DomainError('business_rule', 'COMPANY_OR_BOOK_NOT_ACTIVE', { companyId, bookId });
  return baseCurrency;
}

async function assertLineExchangeRateProvenance(
  client: PoolClient,
  tenantId: string,
  companyId: string,
  businessDate: string,
  baseCurrency: string,
  line: CreateJournalInput['lines'][number],
): Promise<void> {
  if (line.transactionCurrency === baseCurrency) {
    if (!new Decimal(line.exchangeRate).eq(1) || line.exchangeRateId) {
      throw new DomainError('validation', 'BASE_CURRENCY_LINE_REQUIRES_UNIT_RATE', { accountId: line.accountId });
    }
    return;
  }
  if (!line.exchangeRateId) {
    throw new DomainError('validation', 'FOREIGN_CURRENCY_LINE_REQUIRES_RATE_PROVENANCE', { accountId: line.accountId });
  }
  const result = await client.query(
    `SELECT 1 FROM ledger.exchange_rates
      WHERE tenant_id=$1 AND company_id=$2 AND id=$3 AND from_currency=$4 AND to_currency=$5
        AND rate=$6::numeric AND rate_date <= $7::date`,
    [tenantId, companyId, line.exchangeRateId, line.transactionCurrency, baseCurrency, line.exchangeRate, businessDate],
  );
  if (result.rowCount !== 1) {
    throw new DomainError('validation', 'EXCHANGE_RATE_PROVENANCE_MISMATCH', { exchangeRateId: line.exchangeRateId });
  }
}

async function assertParentAccountScope(client: PoolClient, tenantId: string, companyId: string, bookId: string, parentId: string): Promise<void> {
  const result = await client.query(
    `SELECT id FROM ledger.accounts
      WHERE tenant_id=$1 AND company_id=$2 AND book_id=$3 AND id=$4 AND status='ACTIVE'
      FOR SHARE`,
    [tenantId, companyId, bookId, parentId],
  );
  if (result.rowCount !== 1) {
    throw new DomainError('validation', 'PARENT_ACCOUNT_SCOPE_INVALID', { parentId });
  }
}

async function assertAccountsPostable(client: PoolClient, tenantId: string, companyId: string, bookId: string, accountIds: readonly string[]): Promise<void> {
  const uniqueAccountIds = [...new Set(accountIds)];
  const result = await client.query<{ id: string }>(
    `SELECT id FROM ledger.accounts
      WHERE tenant_id=$1 AND company_id=$2 AND book_id=$3
        AND id=ANY($4::uuid[]) AND status='ACTIVE' AND allow_posting
      FOR SHARE`,
    [tenantId, companyId, bookId, uniqueAccountIds],
  );
  const postableIds = new Set(result.rows.map((row) => row.id));
  const invalidAccountId = uniqueAccountIds.find((id) => !postableIds.has(id));
  if (invalidAccountId) {
    throw new DomainError('validation', 'ACCOUNT_NOT_POSTABLE', { accountId: invalidAccountId });
  }
}

async function assertJournalAccountsPostable(client: PoolClient, journal: JournalRow): Promise<void> {
  const lines = await client.query<{ account_id: string }>(
    `SELECT account_id FROM ledger.journal_lines
      WHERE tenant_id=$1 AND journal_id=$2 ORDER BY line_number`,
    [journal.tenant_id, journal.id],
  );
  await assertAccountsPostable(
    client,
    journal.tenant_id,
    journal.company_id,
    journal.book_id,
    lines.rows.map((line) => line.account_id),
  );
}

async function resolvePostingPeriod(
  client: PoolClient,
  journal: JournalRow,
  businessDate: string,
  expectedPeriodId: string | null = journal.period_id,
  softCloseOverrideReason: string | null = null,
): Promise<PostingPeriod> {
  await assertActiveCompanyBook(client, journal.tenant_id, journal.company_id, journal.book_id);
  const result = await client.query<{
    id: string;
    fiscal_year: number;
    status: 'OPEN' | 'SOFT_CLOSED' | 'HARD_CLOSED';
  }>(
    `SELECT id,extract(year FROM start_date)::int AS fiscal_year,status
       FROM ledger.fiscal_periods
      WHERE tenant_id=$1 AND company_id=$2 AND book_id=$3
        AND $4::date BETWEEN start_date AND end_date
      ORDER BY start_date DESC LIMIT 1`,
    [journal.tenant_id, journal.company_id, journal.book_id, businessDate],
  );
  const period = result.rows[0];
  if (!period) throw new DomainError('business_rule', 'ACCOUNTING_PERIOD_CLOSED_OR_MISSING', { businessDate });
  if (period.status === 'HARD_CLOSED') {
    throw new DomainError('business_rule', 'ACCOUNTING_PERIOD_HARD_CLOSED', { businessDate, periodId: period.id });
  }
  if (period.status === 'SOFT_CLOSED') {
    if (!softCloseOverrideReason) {
      throw new DomainError('business_rule', 'SOFT_CLOSE_OVERRIDE_REQUIRED', { businessDate, periodId: period.id });
    }
    const capability = await client.query<{ allowed: boolean }>(
      `SELECT core.has_capability('period.post.soft-closed') AS allowed`,
    );
    if (capability.rows[0]?.allowed !== true) {
      throw new DomainError('authorization', 'SOFT_CLOSE_OVERRIDE_NOT_AUTHORIZED', { periodId: period.id });
    }
    await client.query("SELECT set_config('app.soft_close_override_reason',$1,true)", [softCloseOverrideReason]);
  } else if (softCloseOverrideReason) {
    throw new DomainError('validation', 'SOFT_CLOSE_OVERRIDE_NOT_APPLICABLE', { periodId: period.id });
  }
  if (expectedPeriodId && expectedPeriodId !== period.id) {
    throw new DomainError('business_rule', 'JOURNAL_PERIOD_MISMATCH', { periodId: expectedPeriodId });
  }
  return { id: period.id, fiscalYear: period.fiscal_year };
}

async function allocateNumber(client: PoolClient, journal: JournalRow, period: PostingPeriod, series: DocumentSeries): Promise<string> {
  const year = String(period.fiscalYear).padStart(4, '0');
  const result = await client.query<{ allocated: string }>(
    `INSERT INTO ledger.number_sequences (tenant_id,company_id,book_id,sequence_type,fiscal_year,prefix,next_value)
     VALUES ($1,$2,$3,$4,$5,$6,2)
     ON CONFLICT (tenant_id,book_id,sequence_type,fiscal_year) DO UPDATE
       SET next_value=ledger.number_sequences.next_value+1,prefix=EXCLUDED.prefix,updated_at=now()
     RETURNING (next_value-1)::text allocated`,
    [journal.tenant_id, journal.company_id, journal.book_id, series.sequenceType, period.fiscalYear, `${series.prefix}-${year}-`],
  );
  return `${series.prefix}-${year}-${String(result.rows[0]?.allocated ?? '1').padStart(6, '0')}`;
}

const persistenceRuleMappings: readonly Readonly<{ marker: string; kind: DomainErrorKind }>[] = [
  { marker: 'ACCOUNTING_PERIOD_CLOSED_OR_MISSING', kind: 'business_rule' },
  { marker: 'ACCOUNTING_PERIOD_HARD_CLOSED', kind: 'business_rule' },
  { marker: 'SOFT_CLOSE_OVERRIDE_REQUIRED', kind: 'business_rule' },
  { marker: 'SOFT_CLOSE_OVERRIDE_NOT_AUTHORIZED', kind: 'authorization' },
  { marker: 'SOFT_CLOSE_OVERRIDE_NOT_APPLICABLE', kind: 'validation' },
  { marker: 'INVALID_SOFT_CLOSE_OVERRIDE', kind: 'validation' },
  { marker: 'COMPANY_OR_BOOK_NOT_ACTIVE', kind: 'business_rule' },
  { marker: 'JOURNAL_HAS_INACTIVE_OR_OUT_OF_SCOPE_ACCOUNT', kind: 'business_rule' },
  { marker: 'UNBALANCED_JOURNAL', kind: 'business_rule' },
  { marker: 'JOURNAL_PERIOD_MISMATCH', kind: 'business_rule' },
  { marker: 'INVALID_JOURNAL_REVERSAL_SCOPE', kind: 'business_rule' },
  { marker: 'JOURNAL_ACCOUNT_SCOPE_MISMATCH', kind: 'validation' },
  { marker: 'JOURNAL_CANNOT_REVERSE_ITSELF', kind: 'validation' },
  { marker: 'JOURNAL_CURRENCY_MUST_EQUAL_BOOK_BASE', kind: 'validation' },
  { marker: 'BASE_CURRENCY_LINE_REQUIRES_UNIT_RATE', kind: 'validation' },
  { marker: 'FOREIGN_CURRENCY_LINE_REQUIRES_RATE_PROVENANCE', kind: 'validation' },
  { marker: 'EXCHANGE_RATE_PROVENANCE_MISMATCH', kind: 'validation' },
  { marker: 'TRANSACTION_AND_BASE_AMOUNT_MISMATCH', kind: 'validation' },
  { marker: 'EXCHANGE_RATE_APPEND_ONLY', kind: 'conflict' },
  { marker: 'POSTING_METADATA_REQUIRED', kind: 'conflict' },
  { marker: 'POSTED_JOURNAL_LINES_IMMUTABLE', kind: 'conflict' },
  { marker: 'POSTED_JOURNAL_IMMUTABLE', kind: 'conflict' },
  { marker: 'POSTED_JOURNAL_MUST_USE_POSTING_TRANSITION', kind: 'conflict' },
];

export function mapLedgerPersistenceError(error: unknown): Error {
  if (error instanceof DomainError) return error;
  const databaseError = asDatabaseError(error);
  if (databaseError) {
    const matchedRule = persistenceRuleMappings.find((rule) => databaseError.message.includes(rule.marker));
    if (matchedRule) return new DomainError(matchedRule.kind, matchedRule.marker);
    const parameters = databaseError.constraint ? { constraint: databaseError.constraint } : {};
    if (databaseError.code === '23503') return new DomainError('validation', 'FINANCIAL_SCOPE_INVALID', parameters);
    if (databaseError.code === '23505') return new DomainError('conflict', 'FINANCIAL_RECORD_CONFLICT', parameters);
    if (databaseError.code === '23514') return new DomainError('business_rule', 'FINANCIAL_INVARIANT_VIOLATION', parameters);
    if (databaseError.code === '22003') return new DomainError('validation', 'FINANCIAL_VALUE_OUT_OF_RANGE');
    if (['22P02', '22007', '22008', '23502'].includes(databaseError.code)) {
      return new DomainError('validation', 'INVALID_FINANCIAL_VALUE', parameters);
    }
  }
  return error instanceof Error ? error : new Error('Unknown ledger persistence failure', { cause: error });
}

function asDatabaseError(error: unknown): { code: string; message: string; constraint?: string } | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || !('message' in error)) return null;
  const code = error.code;
  const message = error.message;
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  const constraint = 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : undefined;
  return constraint ? { code, message, constraint } : { code, message };
}

async function claimIdempotency(client: PoolClient, tenantId: string, scope: string, key: string, requestHash: string): Promise<Record<string, unknown> | null> {
  const inserted = await client.query(`INSERT INTO integration.idempotency_keys (tenant_id,scope,key,request_hash,expires_at) VALUES ($1,$2,$3,$4,now()+interval '24 hours') ON CONFLICT DO NOTHING`, [tenantId, scope, key, requestHash]);
  if (inserted.rowCount === 1) return null;
  const prior = await client.query<{ request_hash: string; response_body: Record<string, unknown> | null }>(`SELECT request_hash,response_body FROM integration.idempotency_keys WHERE tenant_id=$1 AND scope=$2 AND key=$3`, [tenantId, scope, key]);
  const row = prior.rows[0];
  if (!row || row.request_hash !== requestHash) throw new DomainError('conflict', 'IDEMPOTENCY_KEY_REUSED');
  if (!row.response_body) throw new DomainError('conflict', 'IDEMPOTENT_REQUEST_IN_PROGRESS');
  return row.response_body;
}

async function completeIdempotency(client: PoolClient, tenantId: string, scope: string, key: string, resourceId: string, response: Record<string, unknown>): Promise<void> {
  await client.query(`UPDATE integration.idempotency_keys SET response_status=200,response_body=$4::jsonb,resource_id=$5 WHERE tenant_id=$1 AND scope=$2 AND key=$3`, [tenantId, scope, key, JSON.stringify(response), resourceId]);
}

async function insertAudit(client: PoolClient, tenantId: string, companyId: string, userId: string, correlationId: string, eventType: string, entityType: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
  await client.query(`INSERT INTO audit.events (tenant_id,company_id,actor_user_id,event_type,entity_type,entity_id,correlation_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [tenantId,companyId,userId,eventType,entityType,entityId,correlationId,JSON.stringify(metadata)]);
}
async function insertOutbox(client: PoolClient, tenantId: string, aggregateType: string, aggregateId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
  await client.query(`INSERT INTO integration.outbox_events (tenant_id,aggregate_type,aggregate_id,event_type,payload) VALUES ($1,$2,$3,$4,$5::jsonb)`, [tenantId,aggregateType,aggregateId,eventType,JSON.stringify(payload)]);
}

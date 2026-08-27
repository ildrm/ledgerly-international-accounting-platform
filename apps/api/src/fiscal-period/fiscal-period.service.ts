import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DomainError, type DomainErrorKind } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import type { Principal } from '../identity/principal';
import type { ActiveTenant } from '../tenant/tenant-context';
import {
  attestableCloseCheckKeys,
  type CreateFiscalPeriodInput,
  type FiscalPeriodScopeQuery,
  type RecordCloseEvidenceInput,
  type TransitionFiscalPeriodInput,
} from './fiscal-period.schemas';

type FiscalPeriodRow = {
  id: string; company_id: string; book_id: string; name: string;
  start_date: string; end_date: string; status: 'OPEN' | 'SOFT_CLOSED' | 'HARD_CLOSED';
  closed_at: string | null; closed_by: string | null; created_at: string; updated_at: string;
};
type EvidenceRow = {
  id: string; check_key: string; status: 'ATTESTED' | 'BLOCKED' | 'NOT_APPLICABLE';
  reason: string; source_reference: string | null; recorded_by: string; created_at: string;
};
type StatusChangeRow = {
  id: string; previous_status: string; new_status: string; reason: string; actor_user_id: string;
  authorization_capability: string | null; authorization_membership_id: string | null;
  correlation_id: string | null; readiness_snapshot: Record<string, unknown>; occurred_at: string;
};
type UnpostedJournalRow = {
  id: string; document_number: string | null; business_date: string; status: 'DRAFT' | 'APPROVED';
  source_type: string; source_id: string; description: string | null;
};

const periodProjection = `id,company_id,book_id,name,start_date::text,end_date::text,status,
  closed_at::text,closed_by,created_at::text,updated_at::text`;

@Injectable()
export class FiscalPeriodService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: Principal, tenant: ActiveTenant, correlationId: string, query: FiscalPeriodScopeQuery) {
    return this.database.tenantTransaction(context(principal, tenant, correlationId), async (client) => {
      await assertActiveCompanyBook(client, tenant.tenantId, query.companyId, query.bookId);
      const result = await client.query<FiscalPeriodRow>(
        `SELECT ${periodProjection} FROM ledger.fiscal_periods
          WHERE tenant_id=$1 AND company_id=$2 AND book_id=$3
          ORDER BY start_date,id LIMIT 500`,
        [tenant.tenantId, query.companyId, query.bookId],
      );
      return { items: result.rows.map(periodResponse) };
    });
  }

  async create(principal: Principal, tenant: ActiveTenant, correlationId: string, input: CreateFiscalPeriodInput) {
    requireCapability(tenant, 'period.create');
    const id = randomUUID();
    try {
      return await this.database.tenantTransaction(context(principal, tenant, correlationId), async (client) => {
        const result = await client.query<FiscalPeriodRow>(
          `SELECT ${periodProjection}
             FROM ledger.create_fiscal_period($1,$2,$3,$4,$5,$6::date,$7::date,$8)`,
          [tenant.tenantId, id, input.companyId, input.bookId, input.name, input.startDate, input.endDate, correlationId],
        );
        const period = result.rows[0];
        if (!period) throw new DomainError('conflict', 'FISCAL_PERIOD_CREATE_DID_NOT_RETURN_ROW');
        return periodResponse(period);
      });
    } catch (error) {
      throw mapFiscalPeriodPersistenceError(error);
    }
  }

  async transition(
    principal: Principal,
    tenant: ActiveTenant,
    correlationId: string,
    periodId: string,
    input: TransitionFiscalPeriodInput,
  ) {
    try {
      return await this.database.tenantTransaction(context(principal, tenant, correlationId), async (client) => {
        const result = await client.query<FiscalPeriodRow>(
          `SELECT ${periodProjection}
             FROM ledger.transition_fiscal_period($1,$2,$3,$4,$5)`,
          [tenant.tenantId, periodId, input.targetStatus, input.reason, correlationId],
        );
        const period = result.rows[0];
        if (!period) throw new DomainError('not_found', 'FISCAL_PERIOD_NOT_FOUND', { periodId });
        return periodResponse(period);
      });
    } catch (error) {
      throw mapFiscalPeriodPersistenceError(error);
    }
  }

  async recordEvidence(
    principal: Principal,
    tenant: ActiveTenant,
    correlationId: string,
    periodId: string,
    input: RecordCloseEvidenceInput,
  ) {
    requireCapability(tenant, 'period.close');
    try {
      return await this.database.tenantTransaction(context(principal, tenant, correlationId), async (client) => {
        const result = await client.query<EvidenceRow>(
          `SELECT id,check_key,status,reason,source_reference,recorded_by,created_at::text
             FROM ledger.record_fiscal_period_close_evidence($1,$2,$3,$4,$5,$6,$7)`,
          [tenant.tenantId, periodId, input.checkKey, input.status, input.reason, input.sourceReference ?? null, correlationId],
        );
        const evidence = result.rows[0];
        if (!evidence) throw new DomainError('conflict', 'FISCAL_PERIOD_EVIDENCE_DID_NOT_RETURN_ROW');
        return evidenceResponse(evidence);
      });
    } catch (error) {
      throw mapFiscalPeriodPersistenceError(error);
    }
  }

  async closeReadiness(principal: Principal, tenant: ActiveTenant, correlationId: string, periodId: string) {
    return this.database.tenantTransaction(context(principal, tenant, correlationId), async (client) => {
      const period = await requiredPeriod(client, tenant.tenantId, periodId);
      const [unposted, evidence] = await Promise.all([
        client.query<UnpostedJournalRow>(
          `SELECT id,document_number,business_date::text,status,source_type,source_id,description
             FROM ledger.journals
            WHERE tenant_id=$1 AND company_id=$2 AND book_id=$3
              AND business_date BETWEEN $4::date AND $5::date
              AND status IN ('DRAFT','APPROVED')
            ORDER BY business_date,id LIMIT 1001`,
          [tenant.tenantId, period.company_id, period.book_id, period.start_date, period.end_date],
        ),
        latestEvidence(client, tenant.tenantId, periodId),
      ]);
      return readinessResponse(period, evidence.rows, unposted.rows);
    });
  }

  async unpostedDocuments(principal: Principal, tenant: ActiveTenant, correlationId: string, periodId: string) {
    return this.database.tenantTransaction(context(principal, tenant, correlationId), async (client) => {
      const period = await requiredPeriod(client, tenant.tenantId, periodId);
      const result = await client.query<UnpostedJournalRow>(
        `SELECT id,document_number,business_date::text,status,source_type,source_id,description
           FROM ledger.journals
          WHERE tenant_id=$1 AND company_id=$2 AND book_id=$3
            AND business_date BETWEEN $4::date AND $5::date
            AND status IN ('DRAFT','APPROVED')
          ORDER BY business_date,id LIMIT 1000`,
        [tenant.tenantId, period.company_id, period.book_id, period.start_date, period.end_date],
      );
      return { periodId, items: result.rows.map((row) => ({
        id: row.id,
        documentNumber: row.document_number,
        businessDate: row.business_date,
        status: row.status,
        sourceType: row.source_type,
        sourceId: row.source_id,
        description: row.description,
      })) };
    });
  }

  async statusHistory(principal: Principal, tenant: ActiveTenant, correlationId: string, periodId: string) {
    return this.database.tenantTransaction(context(principal, tenant, correlationId), async (client) => {
      await requiredPeriod(client, tenant.tenantId, periodId);
      const result = await client.query<StatusChangeRow>(
        `SELECT id,previous_status,new_status,reason,actor_user_id,authorization_capability,
                authorization_membership_id,correlation_id,readiness_snapshot,occurred_at::text
           FROM ledger.fiscal_period_status_changes
          WHERE tenant_id=$1 AND period_id=$2 ORDER BY occurred_at,id LIMIT 500`,
        [tenant.tenantId, periodId],
      );
      return { items: result.rows.map((row) => ({
        id: row.id,
        previousStatus: row.previous_status,
        newStatus: row.new_status,
        reason: row.reason,
        actorUserId: row.actor_user_id,
        authorizationCapability: row.authorization_capability,
        authorizationMembershipId: row.authorization_membership_id,
        correlationId: row.correlation_id,
        readinessSnapshot: row.readiness_snapshot,
        occurredAt: row.occurred_at,
      })) };
    });
  }
}

function context(principal: Principal, tenant: ActiveTenant, correlationId: string) {
  return { userId: principal.userId, tenantId: tenant.tenantId, correlationId };
}

function requireCapability(tenant: ActiveTenant, capability: string): void {
  if (!tenant.capabilities.includes(capability)) {
    throw new DomainError('authorization', 'FISCAL_PERIOD_CAPABILITY_REQUIRED', { capability });
  }
}

async function assertActiveCompanyBook(client: PoolClient, tenantId: string, companyId: string, bookId: string): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM core.companies company
      JOIN ledger.books book ON book.tenant_id=company.tenant_id AND book.company_id=company.id
     WHERE company.tenant_id=$1 AND company.id=$2 AND company.status='ACTIVE'
       AND book.id=$3 AND book.status='ACTIVE' FOR SHARE OF company,book`,
    [tenantId, companyId, bookId],
  );
  if (result.rowCount !== 1) throw new DomainError('business_rule', 'COMPANY_OR_BOOK_NOT_ACTIVE', { companyId, bookId });
}

async function requiredPeriod(client: PoolClient, tenantId: string, periodId: string): Promise<FiscalPeriodRow> {
  const result = await client.query<FiscalPeriodRow>(
    `SELECT ${periodProjection} FROM ledger.fiscal_periods WHERE tenant_id=$1 AND id=$2`,
    [tenantId, periodId],
  );
  const period = result.rows[0];
  if (!period) throw new DomainError('not_found', 'FISCAL_PERIOD_NOT_FOUND', { periodId });
  return period;
}

function latestEvidence(client: PoolClient, tenantId: string, periodId: string) {
  return client.query<EvidenceRow>(
    `SELECT DISTINCT ON (check_key)
            id,check_key,status,reason,source_reference,recorded_by,created_at::text
       FROM ledger.fiscal_period_close_evidence
      WHERE tenant_id=$1 AND period_id=$2
        AND created_at > coalesce((
          SELECT max(status_change.occurred_at)
            FROM ledger.fiscal_period_status_changes status_change
           WHERE status_change.tenant_id=$1
             AND status_change.period_id=$2
             AND status_change.new_status='OPEN'
        ), '-infinity'::timestamptz)
      ORDER BY check_key,created_at DESC,id DESC`,
    [tenantId, periodId],
  );
}

function periodResponse(row: FiscalPeriodRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    bookId: row.book_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function evidenceResponse(row: EvidenceRow) {
  return {
    id: row.id,
    checkKey: row.check_key,
    status: row.status,
    reason: row.reason,
    sourceReference: row.source_reference,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
}

function readinessResponse(period: FiscalPeriodRow, evidenceRows: readonly EvidenceRow[], unpostedRows: readonly UnpostedJournalRow[]) {
  const evidenceByKey = new Map(evidenceRows.map((evidence) => [evidence.check_key, evidence]));
  const unpostedCount = unpostedRows.length;
  const checks: Record<string, unknown>[] = [{
    key: 'unposted_documents',
    availability: 'AVAILABLE',
    state: unpostedCount === 0 ? 'PASS' : 'BLOCKED',
    automated: true,
    blocking: unpostedCount > 0,
    unavailableReason: null,
    evidence: { count: unpostedCount, truncated: unpostedCount > 1000 },
    drillDown: { method: 'GET', href: `/api/v1/fiscal-periods/${period.id}/unposted-documents` },
  }];

  for (const key of attestableCloseCheckKeys) {
    const evidence = evidenceByKey.get(key);
    checks.push({
      key,
      availability: 'UNAVAILABLE',
      state: evidence?.status ?? 'PENDING',
      automated: false,
      blocking: !evidence || evidence.status === 'BLOCKED',
      unavailableReason: 'SUBSYSTEM_NOT_IMPLEMENTED',
      evidence: evidence ? evidenceResponse(evidence) : null,
      drillDown: null,
    });
    evidenceByKey.delete(key);
  }
  for (const evidence of evidenceByKey.values()) {
    checks.push({
      key: evidence.check_key,
      availability: 'EXTERNAL',
      state: evidence.status,
      automated: false,
      blocking: evidence.status === 'BLOCKED',
      unavailableReason: null,
      evidence: evidenceResponse(evidence),
      drillDown: null,
    });
  }

  const count = (state: string) => checks.filter((check) => check.state === state).length;
  return {
    periodId: period.id,
    periodStatus: period.status,
    canHardClose: period.status === 'SOFT_CLOSED' && checks.every((check) => check.blocking === false),
    summary: {
      systemPassed: count('PASS'),
      attested: count('ATTESTED') + count('NOT_APPLICABLE'),
      blocked: count('BLOCKED'),
      pending: count('PENDING'),
      unavailable: checks.filter((check) => check.availability === 'UNAVAILABLE').length,
    },
    checks,
  };
}

const persistenceRules: readonly Readonly<{ marker: string; kind: DomainErrorKind }>[] = [
  { marker: 'FISCAL_PERIOD_HARD_CLOSE_REOPEN_NOT_AUTHORIZED', kind: 'authorization' },
  { marker: 'FISCAL_PERIOD_CAPABILITY_REQUIRED', kind: 'authorization' },
  { marker: 'TENANT_ACCESS_DENIED', kind: 'authorization' },
  { marker: 'FISCAL_PERIOD_NOT_FOUND', kind: 'not_found' },
  { marker: 'FISCAL_PERIOD_STATUS_UNCHANGED', kind: 'conflict' },
  { marker: 'FISCAL_PERIOD_HAS_UNPOSTED_DOCUMENTS', kind: 'business_rule' },
  { marker: 'FISCAL_PERIOD_CLOSE_CHECKLIST_BLOCKED', kind: 'business_rule' },
  { marker: 'FISCAL_PERIOD_CLOSE_CHECKLIST_INCOMPLETE', kind: 'business_rule' },
  { marker: 'COMPANY_OR_BOOK_NOT_ACTIVE', kind: 'business_rule' },
  { marker: 'INVALID_FISCAL_PERIOD_TRANSITION', kind: 'business_rule' },
  { marker: 'FISCAL_PERIOD_CHECK_IS_SYSTEM_MANAGED', kind: 'validation' },
  { marker: 'INVALID_FISCAL_PERIOD_EVIDENCE', kind: 'validation' },
  { marker: 'INVALID_FISCAL_PERIOD_VALUE', kind: 'validation' },
  { marker: 'FISCAL_PERIOD_SCOPE_IMMUTABLE', kind: 'conflict' },
];

export function mapFiscalPeriodPersistenceError(error: unknown): Error {
  if (error instanceof DomainError) return error;
  const databaseError = asDatabaseError(error);
  if (databaseError) {
    const rule = persistenceRules.find(({ marker }) => databaseError.message.includes(marker));
    if (rule) return new DomainError(rule.kind, rule.marker);
    if (databaseError.code === '23P01') return new DomainError('conflict', 'FISCAL_PERIOD_OVERLAPS');
    if (databaseError.code === '23503') return new DomainError('validation', 'FISCAL_PERIOD_SCOPE_INVALID');
    if (databaseError.code === '23505') return new DomainError('conflict', 'FISCAL_PERIOD_CONFLICT');
    if (databaseError.code === '23514' || databaseError.code === '22007') {
      return new DomainError('validation', 'INVALID_FISCAL_PERIOD_VALUE');
    }
  }
  return error instanceof Error ? error : new Error('Unknown fiscal-period persistence failure', { cause: error });
}

function asDatabaseError(error: unknown): { code: string; message: string } | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || !('message' in error)) return null;
  return typeof error.code === 'string' && typeof error.message === 'string'
    ? { code: error.code, message: error.message }
    : null;
}

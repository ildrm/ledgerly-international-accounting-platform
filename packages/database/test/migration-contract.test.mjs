import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const migrationUrl = new URL('../migrations/0000_foundation.sql', import.meta.url);
const migration = await readFile(migrationUrl, 'utf8');
const tenantDiscoveryMigration = await readFile(new URL('../migrations/0001_user_tenant_discovery.sql', import.meta.url), 'utf8');
const invariantMigration = await readFile(new URL('../migrations/0002_financial_scope_and_immutability.sql', import.meta.url), 'utf8');
const exchangeRateMigration = await readFile(new URL('../migrations/0003_exchange_rates_and_fx_provenance.sql', import.meta.url), 'utf8');
const fiscalPeriodMigration = await readFile(new URL('../migrations/0004_fiscal_period_administration.sql', import.meta.url), 'utf8');
const postingLockMigration = await readFile(new URL('../migrations/0005_posting_period_lock_privilege_fix.sql', import.meta.url), 'utf8');
const roleBootstrap = await readFile(new URL('../../../infra/docker/postgres/init/000_roles.sql', import.meta.url), 'utf8');

describe('financial migration contract', () => {
  it('forces RLS on tenant-owned financial tables', () => {
    for (const table of ['core.companies', 'core.memberships', 'ledger.books', 'ledger.fiscal_periods', 'ledger.accounts', 'ledger.journals', 'ledger.journal_lines', 'audit.events', 'integration.outbox_events']) {
      assert.match(migration, new RegExp(`ALTER TABLE ${table.replace('.', '\\.') } FORCE ROW LEVEL SECURITY`, 'u'));
    }
    assert.match(roleBootstrap, /NOBYPASSRLS/u);
  });

  it('protects posted journals and append-only audit events with triggers', () => {
    assert.match(migration, /CREATE TRIGGER protect_posted_journal/u);
    assert.match(migration, /CREATE TRIGGER protect_posted_lines/u);
    assert.match(migration, /CREATE TRIGGER audit_append_only/u);
    assert.match(migration, /POSTED_JOURNAL_IMMUTABLE/u);
  });

  it('uses exact finance numerics, composite tenant keys, idempotency, and outbox', () => {
    assert.match(migration, /numeric\(38,12\)/u);
    assert.match(migration, /numeric\(38,18\)/u);
    assert.match(migration, /FOREIGN KEY \(tenant_id, journal_id\)/u);
    assert.match(migration, /CREATE TABLE integration\.idempotency_keys/u);
    assert.match(migration, /CREATE TABLE integration\.outbox_events/u);
  });

  it('allows user-level tenant discovery only through an active membership', () => {
    assert.match(tenantDiscoveryMigration, /membership\.user_id = core\.current_user_id\(\)/u);
    assert.match(tenantDiscoveryMigration, /membership\.status = 'ACTIVE'/u);
    assert.match(tenantDiscoveryMigration, /WITH CHECK \(id = core\.current_tenant_id\(\)\)/u);
  });

  it('checks both old and new parents before any journal-line move', () => {
    assert.match(invariantMigration, /OLD\.tenant_id AND id = OLD\.journal_id/u);
    assert.match(invariantMigration, /NEW\.tenant_id AND id = NEW\.journal_id/u);
    assert.match(invariantMigration, /POSTED_JOURNAL_LINES_IMMUTABLE/u);
  });

  it('rejects direct posted inserts and cross-book financial references', () => {
    assert.match(invariantMigration, /POSTED_JOURNAL_MUST_USE_POSTING_TRANSITION/u);
    assert.match(invariantMigration, /fk_journals_company_book/u);
    assert.match(invariantMigration, /fk_journals_period_same_book/u);
    assert.match(invariantMigration, /fk_accounts_parent_same_book/u);
    assert.match(invariantMigration, /JOURNAL_ACCOUNT_SCOPE_MISMATCH/u);
    assert.match(invariantMigration, /INVALID_JOURNAL_REVERSAL_SCOPE/u);
  });

  it('makes financial ownership keys and reversal mappings immutable', () => {
    for (const marker of [
      'BOOK_SCOPE_IMMUTABLE',
      'FISCAL_PERIOD_SCOPE_IMMUTABLE',
      'ACCOUNT_SCOPE_IMMUTABLE',
      'JOURNAL_SCOPE_IMMUTABLE',
      'JOURNAL_REVERSAL_APPEND_ONLY',
    ]) {
      assert.match(invariantMigration, new RegExp(marker, 'u'));
    }
    assert.match(invariantMigration, /BEFORE UPDATE OR DELETE ON ledger\.journal_reversals/u);
  });

  it('requires an active caller membership for tenant-owned data', () => {
    assert.match(invariantMigration, /CREATE OR REPLACE FUNCTION core\.has_active_tenant_membership/u);
    assert.match(invariantMigration, /membership\.status = 'ACTIVE'/u);
    assert.match(invariantMigration, /CREATE POLICY journal_scope[\s\S]*core\.has_active_tenant_membership\(tenant_id\)/u);
    assert.match(invariantMigration, /WITH CHECK \([\s\S]*user_id = core\.current_user_id\(\)/u);
    assert.match(invariantMigration, /REVOKE UPDATE ON core\.memberships FROM ledgerly_runtime/u);
  });

  it('stores immutable exchange-rate provenance and validates foreign journal lines', () => {
    assert.match(exchangeRateMigration, /CREATE TABLE ledger\.exchange_rates/u);
    assert.match(exchangeRateMigration, /numeric\(38,18\)/u);
    assert.match(exchangeRateMigration, /CREATE TRIGGER exchange_rates_append_only/u);
    assert.match(exchangeRateMigration, /FOREIGN_CURRENCY_LINE_REQUIRES_RATE_PROVENANCE/u);
    assert.match(exchangeRateMigration, /EXCHANGE_RATE_PROVENANCE_MISMATCH/u);
    assert.match(exchangeRateMigration, /TRANSACTION_AND_BASE_AMOUNT_MISMATCH/u);
    assert.match(exchangeRateMigration, /JOURNAL_CURRENCY_MUST_EQUAL_BOOK_BASE/u);
  });

  it('enforces non-overlapping fiscal periods and database-authorized lifecycle changes', () => {
    assert.match(fiscalPeriodMigration, /EXCLUDE USING gist[\s\S]*daterange\(start_date, end_date, '\[\]'\) WITH &&/u);
    assert.match(fiscalPeriodMigration, /CREATE OR REPLACE FUNCTION ledger\.create_fiscal_period/u);
    assert.match(fiscalPeriodMigration, /CREATE OR REPLACE FUNCTION ledger\.transition_fiscal_period/u);
    assert.match(fiscalPeriodMigration, /core\.has_capability\('period\.create'\)/u);
    assert.match(fiscalPeriodMigration, /core\.has_capability\('period\.close'\)/u);
    assert.match(fiscalPeriodMigration, /core\.has_capability\('period\.reopen\.hard-closed'\)/u);
    assert.match(fiscalPeriodMigration, /REVOKE INSERT, UPDATE ON ledger\.fiscal_periods FROM ledgerly_runtime/u);
  });

  it('keeps close evidence and status provenance append-only and cycle-scoped', () => {
    assert.match(fiscalPeriodMigration, /CREATE TABLE ledger\.fiscal_period_close_evidence/u);
    assert.match(fiscalPeriodMigration, /CREATE TABLE ledger\.fiscal_period_status_changes/u);
    assert.match(fiscalPeriodMigration, /fiscal_period_close_evidence_append_only/u);
    assert.match(fiscalPeriodMigration, /fiscal_period_status_changes_append_only/u);
    assert.match(fiscalPeriodMigration, /evidence\.created_at > coalesce\([\s\S]*status_change\.new_status = 'OPEN'/u);
    assert.match(fiscalPeriodMigration, /readiness_snapshot/u);
  });

  it('requires a documented authorized override for soft-closed posting', () => {
    assert.match(fiscalPeriodMigration, /SOFT_CLOSE_OVERRIDE_REQUIRED/u);
    assert.match(fiscalPeriodMigration, /SOFT_CLOSE_OVERRIDE_NOT_AUTHORIZED/u);
    assert.match(fiscalPeriodMigration, /core\.has_capability\('period\.post\.soft-closed'\)/u);
    assert.match(fiscalPeriodMigration, /app\.soft_close_override_reason/u);
    assert.match(fiscalPeriodMigration, /ACCOUNTING_PERIOD_HARD_CLOSED/u);
  });

  it('retains the authoritative period row lock without restoring runtime writes', () => {
    assert.match(postingLockMigration, /ALTER FUNCTION ledger\.validate_posting\(\) SECURITY DEFINER/u);
    assert.match(postingLockMigration, /SET search_path = pg_catalog, core, ledger/u);
    assert.match(postingLockMigration, /REVOKE ALL ON FUNCTION ledger\.validate_posting\(\) FROM PUBLIC/u);
    assert.match(fiscalPeriodMigration, /REVOKE INSERT, UPDATE ON ledger\.fiscal_periods FROM ledgerly_runtime/u);
  });
});

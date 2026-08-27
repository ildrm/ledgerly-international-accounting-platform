import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import pg from 'pg';

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (!runtimeUrl || !migrationUrl) {
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL are required for database integration tests.');
}

const runtimePool = new pg.Pool({ connectionString: runtimeUrl, max: 2, application_name: 'ledgerly-db-invariant-test' });
const migrationPool = new pg.Pool({ connectionString: migrationUrl, max: 1, application_name: 'ledgerly-db-invariant-admin-test' });

const fixture = Object.freeze({
  userId: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  companyId: '30000000-0000-4000-8000-000000000001',
  bookId: '40000000-0000-4000-8000-000000000001',
  accountId: '50000000-0000-4000-8000-000000000001',
  postedJournalId: '60000000-0000-4000-8000-000000000001',
  fiscalPeriodId: '41000000-0000-4000-8000-000000000001',
});

after(async () => {
  await Promise.all([runtimePool.end(), migrationPool.end()]);
});

async function withRuntimeContext(userId, tenantId, work) {
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [userId, tenantId]);
    return await work(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

describe('live PostgreSQL financial invariants', () => {
  it('records the financial-scope and fiscal-period administration migrations', async () => {
    const result = await migrationPool.query(
      `SELECT filename, checksum
         FROM migration.history
        WHERE filename IN (
          '0002_financial_scope_and_immutability.sql',
          '0004_fiscal_period_administration.sql',
          '0005_posting_period_lock_privilege_fix.sql'
        )
        ORDER BY filename`,
    );
    assert.deepEqual(result.rows.map((row) => row.filename), [
      '0002_financial_scope_and_immutability.sql',
      '0004_fiscal_period_administration.sql',
      '0005_posting_period_lock_privilege_fix.sql',
    ]);
    for (const row of result.rows) assert.match(row.checksum, /^[a-f0-9]{64}$/u);
  });

  it('shows tenant data to an active member and hides it from a forged tenant context', async () => {
    const ownerCount = await withRuntimeContext(fixture.userId, fixture.tenantId, async (client) => {
      const result = await client.query('SELECT count(*)::integer AS count FROM core.companies');
      return result.rows[0].count;
    });
    const attackerCount = await withRuntimeContext(randomUUID(), fixture.tenantId, async (client) => {
      const result = await client.query('SELECT count(*)::integer AS count FROM core.companies');
      return result.rows[0].count;
    });

    assert.equal(ownerCount, 1);
    assert.equal(attackerCount, 0);
  });

  it('prevents runtime callers from manufacturing another user membership', async () => {
    await assert.rejects(
      withRuntimeContext(randomUUID(), fixture.tenantId, (client) => client.query(
        `INSERT INTO core.memberships (tenant_id, user_id, role, status)
         VALUES ($1, $2, 'OWNER', 'ACTIVE')`,
        [fixture.tenantId, fixture.userId],
      )),
      (error) => error?.code === '42501',
    );
  });

  it('allows fiscal-period changes only through capability-checked database functions', async () => {
    await assert.rejects(
      withRuntimeContext(fixture.userId, fixture.tenantId, (client) => client.query(
        `INSERT INTO ledger.fiscal_periods
          (id, tenant_id, company_id, book_id, name, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, 'Unauthorized direct period', '2030-01-01', '2030-12-31', 'OPEN')`,
        [randomUUID(), fixture.tenantId, fixture.companyId, fixture.bookId],
      )),
      (error) => error?.code === '42501',
    );

    await assert.rejects(
      withRuntimeContext(fixture.userId, fixture.tenantId, (client) => client.query(
        `UPDATE ledger.fiscal_periods
            SET status = 'SOFT_CLOSED', closed_at = now(), closed_by = $1
          WHERE tenant_id = $2 AND id = $3`,
        [fixture.userId, fixture.tenantId, fixture.fiscalPeriodId],
      )),
      (error) => error?.code === '42501',
    );

    await assert.rejects(
      withRuntimeContext(fixture.userId, fixture.tenantId, (client) => client.query(
        'DELETE FROM ledger.fiscal_periods WHERE tenant_id = $1 AND id = $2',
        [fixture.tenantId, fixture.fiscalPeriodId],
      )),
      (error) => error?.code === '42501',
    );
  });

  it('rejects ownership-key mutation and direct posted-journal insertion', async () => {
    await assert.rejects(
      migrationPool.query(
        'UPDATE ledger.accounts SET company_id = $1 WHERE id = $2',
        [randomUUID(), fixture.accountId],
      ),
      (error) => error?.code === '23514' && error?.message === 'ACCOUNT_SCOPE_IMMUTABLE',
    );

    await assert.rejects(
      migrationPool.query(
        `INSERT INTO ledger.journals
          (id, tenant_id, company_id, book_id, business_date, status, source_type, source_id, currency, created_by)
         VALUES ($1, $2, $3, $4, '2026-01-15', 'POSTED', 'INVARIANT_TEST', $5, 'USD', $6)`,
        [randomUUID(), fixture.tenantId, fixture.companyId, fixture.bookId, randomUUID(), fixture.userId],
      ),
      (error) => error?.code === '23514' && error?.message === 'POSTED_JOURNAL_MUST_USE_POSTING_TRANSITION',
    );
  });

  it('keeps an already-posted journal immutable', async () => {
    await assert.rejects(
      migrationPool.query(
        'UPDATE ledger.journals SET description = $1 WHERE id = $2',
        ['tamper attempt', fixture.postedJournalId],
      ),
      (error) => error?.code === '23514' && error?.message === 'POSTED_JOURNAL_IMMUTABLE',
    );
  });
});

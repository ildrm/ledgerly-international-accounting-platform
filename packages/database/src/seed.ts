import { argon2id, hash } from 'argon2';
import pg from 'pg';

if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
  throw new Error('Deterministic seed requires NODE_ENV=development or NODE_ENV=test.');
}
if (process.env.LEDGERLY_SEED_PROFILE !== 'deterministic-development') {
  throw new Error('Set LEDGERLY_SEED_PROFILE=deterministic-development to acknowledge the known local credentials.');
}
const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required for deterministic seeding.');

const ids = {
  user: '10000000-0000-4000-8000-000000000001', tenant: '20000000-0000-4000-8000-000000000001',
  membership: '21000000-0000-4000-8000-000000000001', company: '30000000-0000-4000-8000-000000000001',
  book: '40000000-0000-4000-8000-000000000001', period: '41000000-0000-4000-8000-000000000001',
  bank: '50000000-0000-4000-8000-000000000001', ar: '50000000-0000-4000-8000-000000000002',
  tax: '50000000-0000-4000-8000-000000000003', sales: '50000000-0000-4000-8000-000000000004',
  equity: '50000000-0000-4000-8000-000000000005', invoice: '60000000-0000-4000-8000-000000000001',
  payment: '60000000-0000-4000-8000-000000000002',
} as const;

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, application_name: 'ledgerly-seed' });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [ids.user, ids.tenant]);
  const passwordHash = await hash('ChangeMe-Accounting-2026!', { type: argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 });
  await client.query(`INSERT INTO iam.users (id,email,display_name,password_hash,email_verified_at)
    VALUES ($1,'owner@ledgerly.local','Demo Owner',$2,now()) ON CONFLICT (id) DO UPDATE SET password_hash=EXCLUDED.password_hash`, [ids.user, passwordHash]);
  await client.query(`INSERT INTO core.user_localization_preferences (user_id,ui_locale,format_locale,time_zone,calendar,numbering_system)
    VALUES ($1,'en-US','en-US','UTC','gregory','latn') ON CONFLICT (user_id) DO NOTHING`, [ids.user]);
  await client.query(`INSERT INTO core.tenants (id,name,slug,default_locale,time_zone) VALUES ($1,'Ledgerly Service Demo','ledgerly-service-demo','en-US','UTC') ON CONFLICT (id) DO NOTHING`, [ids.tenant]);
  await client.query(`INSERT INTO core.memberships (id,tenant_id,user_id,role,status) VALUES ($1,$2,$3,'OWNER','ACTIVE') ON CONFLICT (id) DO NOTHING`, [ids.membership, ids.tenant, ids.user]);
  await client.query(`INSERT INTO core.companies (id,tenant_id,name,country_code,base_currency,time_zone) VALUES ($1,$2,'Northstar Services','US','USD','UTC') ON CONFLICT (id) DO NOTHING`, [ids.company, ids.tenant]);
  await client.query(`INSERT INTO ledger.books (id,tenant_id,company_id,code,name,base_currency) VALUES ($1,$2,$3,'STAT','Statutory Book','USD') ON CONFLICT (id) DO NOTHING`, [ids.book, ids.tenant, ids.company]);
  await client.query(`INSERT INTO ledger.fiscal_periods (id,tenant_id,company_id,book_id,name,start_date,end_date) VALUES ($1,$2,$3,$4,'FY 2026','2026-01-01','2026-12-31') ON CONFLICT (id) DO NOTHING`, [ids.period, ids.tenant, ids.company, ids.book]);
  const accounts = [
    [ids.bank,'1000','Bank','ASSET','D',false], [ids.ar,'1100','Accounts Receivable','ASSET','D',true],
    [ids.tax,'2100','Tax Payable','LIABILITY','C',true], [ids.sales,'4000','Service Revenue','REVENUE','C',false],
    [ids.equity,'3000','Owner Equity','EQUITY','C',false],
  ] as const;
  for (const account of accounts) {
    await client.query(`INSERT INTO ledger.accounts (id,tenant_id,company_id,book_id,code,name,type,normal_balance,is_control)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`, [account[0], ids.tenant, ids.company, ids.book, ...account.slice(1)]);
  }
  await seedJournal(client, ids.invoice, 'INV-2026-0001', 'SALES_INVOICE', 'demo-invoice-001', [
    [ids.ar,'10900','0'], [ids.sales,'0','10000'], [ids.tax,'0','900'],
  ], ids);
  await seedJournal(client, ids.payment, 'JRN-2026-0002', 'CUSTOMER_PAYMENT', 'demo-payment-001', [
    [ids.bank,'10900','0'], [ids.ar,'0','10900'],
  ], ids);
  await client.query('COMMIT');
  process.stdout.write('Seeded the deterministic service-company scenario.\n');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}

async function seedJournal(client: pg.PoolClient, journalId: string, number: string, sourceType: string, sourceId: string, lines: readonly (readonly [string,string,string])[], context: typeof ids): Promise<void> {
  const exists = await client.query('SELECT 1 FROM ledger.journals WHERE id=$1', [journalId]);
  if (exists.rowCount) return;
  await client.query(`INSERT INTO ledger.journals (id,tenant_id,company_id,book_id,business_date,status,description,source_type,source_id,currency,created_by)
    VALUES ($1,$2,$3,$4,'2026-01-15','DRAFT','Deterministic acceptance scenario',$5,$6,'USD',$7)`, [journalId, context.tenant, context.company, context.book, sourceType, sourceId, context.user]);
  for (let index=0; index<lines.length; index+=1) {
    const line = lines[index];
    if (!line) continue;
    const transactionAmount = line[1] !== '0' ? line[1] : `-${line[2]}`;
    await client.query(`INSERT INTO ledger.journal_lines (tenant_id,journal_id,line_number,account_id,debit,credit,transaction_amount,transaction_currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'USD')`, [context.tenant,journalId,index+1,line[0],line[1],line[2],transactionAmount]);
  }
  await client.query(`UPDATE ledger.journals SET status='POSTED',period_id=$2,document_number=$3,posted_by=$4,posted_at=now() WHERE id=$1`, [journalId,context.period,number,context.user]);
}

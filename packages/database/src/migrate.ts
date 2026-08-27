import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required.');

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, application_name: 'ledgerly-migrator' });
const client = await pool.connect();

try {
  await client.query('SELECT pg_advisory_lock($1)', [7_606_041_991]);
  await client.query('CREATE SCHEMA IF NOT EXISTS migration');
  await client.query(`CREATE TABLE IF NOT EXISTS migration.history (
    filename text PRIMARY KEY,
    checksum char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = (await readdir(migrationDirectory)).filter((file) => /^\d+_.+\.sql$/u.test(file)).sort();
  for (const filename of files) {
    const sql = await readFile(join(migrationDirectory, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const prior = await client.query<{ checksum: string }>('SELECT checksum FROM migration.history WHERE filename = $1', [filename]);
    if (prior.rows[0]) {
      if (prior.rows[0].checksum !== checksum) throw new Error(`Applied migration ${filename} has changed.`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO migration.history (filename, checksum) VALUES ($1, $2)', [filename, checksum]);
      await client.query('COMMIT');
      process.stdout.write(`Applied ${filename}\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [7_606_041_991]).catch(() => undefined);
  client.release();
  await pool.end();
}

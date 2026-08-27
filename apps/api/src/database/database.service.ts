import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { ENVIRONMENT, type Environment } from '../config/environment';

export type TenantExecutionContext = Readonly<{ userId: string; tenantId: string; correlationId: string }>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.pool = new Pool({
      connectionString: environment.databaseUrl,
      max: environment.databasePoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'ledgerly-api',
    });
  }

  query<Row extends QueryResultRow = QueryResultRow>(sql: string, values: readonly unknown[] = []): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(sql, [...values]);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async tenantTransaction<T>(context: TenantExecutionContext, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true), set_config('app.correlation_id', $3, true)", [context.userId, context.tenantId, context.correlationId]);
      return work(client);
    });
  }

  async userTransaction<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      return work(client);
    });
  }

  async isReady(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

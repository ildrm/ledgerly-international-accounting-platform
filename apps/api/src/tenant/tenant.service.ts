import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import type { Principal } from '../identity/principal';
import type { CreateTenantInput } from './tenant.schemas';

type TenantRole = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'BOOKKEEPER' | 'AUDITOR';

export type TenantListItem = Readonly<{
  id: string;
  name: string;
  slug: string;
  membershipId: string;
  role: TenantRole;
  companyCount: number;
}>;

export type TenantListResult = Readonly<{ items: readonly TenantListItem[] }>;

export type TenantCompanyListItem = Readonly<{
  id: string;
  name: string;
  country_code: string;
  base_currency: string;
  time_zone: string;
  status: string;
}>;

export type TenantCompanyListResult = Readonly<{ items: readonly TenantCompanyListItem[] }>;

@Injectable()
export class TenantService {
  constructor(private readonly database: DatabaseService) {}

  async create(principal: Principal, input: CreateTenantInput): Promise<object> {
    const tenantId = randomUUID();
    const membershipId = randomUUID();
    const companyId = randomUUID();
    const bookId = randomUUID();
    const periodId = randomUUID();
    const correlationId = randomUUID();
    try {
      return await this.database.tenantTransaction({ userId: principal.userId, tenantId, correlationId }, async (client) => {
        await client.query(
          `INSERT INTO core.tenants (id, name, slug, status, default_locale, time_zone)
           VALUES ($1, $2, $3, 'ACTIVE', $4, $5)`,
          [tenantId, input.name, input.slug, input.defaultLocale, input.timeZone],
        );
        await client.query(
          `INSERT INTO core.memberships (id, tenant_id, user_id, role, status, capabilities)
           VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', $4::text[])`,
          [membershipId, tenantId, principal.userId, [
            'period.create',
            'period.close',
            'period.post.soft-closed',
            'period.reopen.hard-closed',
          ]],
        );
        await client.query(
          `INSERT INTO core.companies
             (id, tenant_id, name, country_code, base_currency, time_zone, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
          [companyId, tenantId, input.companyName, input.countryCode, input.baseCurrency, input.timeZone],
        );
        await client.query(
          `INSERT INTO ledger.books
             (id, tenant_id, company_id, code, name, kind, base_currency, status)
           VALUES ($1, $2, $3, 'PRIMARY', 'Primary statutory book', 'STATUTORY', $4, 'ACTIVE')`,
          [bookId, tenantId, companyId, input.baseCurrency],
        );
        await client.query(
          `SELECT id
             FROM ledger.create_fiscal_period($1,$2,$3,$4,$5,$6::date,$7::date,$8)`,
          [
            tenantId,
            periodId,
            companyId,
            bookId,
            input.fiscalPeriod.name,
            input.fiscalPeriod.startDate,
            input.fiscalPeriod.endDate,
            correlationId,
          ],
        );
        await client.query(
          `INSERT INTO audit.events
             (tenant_id, company_id, actor_user_id, event_type, entity_type, entity_id, metadata)
           VALUES ($1, $2, $3, 'TENANT.CREATED', 'TENANT', $1, jsonb_build_object('slug', $4::text))`,
          [tenantId, companyId, principal.userId, input.slug],
        );
        return {
          tenant: { id: tenantId, name: input.name, slug: input.slug },
          membership: { id: membershipId, role: 'OWNER' },
          company: { id: companyId, name: input.companyName, baseCurrency: input.baseCurrency },
          book: { id: bookId, code: 'PRIMARY', kind: 'STATUTORY', baseCurrency: input.baseCurrency },
          fiscalPeriod: {
            id: periodId,
            name: input.fiscalPeriod.name,
            startDate: input.fiscalPeriod.startDate,
            endDate: input.fiscalPeriod.endDate,
            status: 'OPEN',
          },
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('conflict', 'TENANT_SLUG_ALREADY_EXISTS', { slug: input.slug });
      throw error;
    }
  }

  async listForUser(principal: Principal): Promise<TenantListResult> {
    return this.database.userTransaction(principal.userId, async (client) => {
      const memberships = await client.query<{
        tenant_id: string; tenant_name: string; tenant_slug: string; membership_id: string; role: TenantRole;
      }>(
        `SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
                m.id AS membership_id, m.role
           FROM core.memberships m
           JOIN core.tenants t ON t.id = m.tenant_id
          WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND t.status = 'ACTIVE'
          ORDER BY t.name, t.id`,
        [principal.userId],
      );
      const items: TenantListItem[] = [];
      for (const row of memberships.rows) {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [row.tenant_id]);
        const companies = await client.query<{ company_count: string }>(
          `SELECT count(*)::text AS company_count
             FROM core.companies WHERE tenant_id = $1 AND status = 'ACTIVE'`,
          [row.tenant_id],
        );
        items.push({
          id: row.tenant_id,
          name: row.tenant_name,
          slug: row.tenant_slug,
          membershipId: row.membership_id,
          role: row.role,
          companyCount: Number(companies.rows[0]?.company_count ?? '0'),
        });
      }
      return { items };
    });
  }

  async listCompanies(principal: Principal, tenantId: string, correlationId: string): Promise<TenantCompanyListResult> {
    return this.database.tenantTransaction({ userId: principal.userId, tenantId, correlationId }, async (client) => {
      const result = await client.query<TenantCompanyListItem>(
        `SELECT id, name, country_code, base_currency, time_zone, status
           FROM core.companies WHERE tenant_id = $1 ORDER BY name, id LIMIT 100`,
        [tenantId],
      );
      return { items: result.rows };
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

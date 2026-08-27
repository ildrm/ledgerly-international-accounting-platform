import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import type { AuthenticatedRequest } from '../identity/principal';
import type { TenantRequest } from './tenant-context';

type MembershipRow = { id: string; role: string; capabilities: string[] };

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & TenantRequest>();
    const tenantIdHeader = request.headers['x-tenant-id'];
    const tenantId = Array.isArray(tenantIdHeader) ? tenantIdHeader[0] : tenantIdHeader;
    if (!tenantId || !isUuid(tenantId) || !request.principal) {
      throw new DomainError('authorization', 'TENANT_CONTEXT_REQUIRED');
    }
    const result = await this.database.tenantTransaction(
      { userId: request.principal.userId, tenantId, correlationId: request.id },
      (client) => client.query<MembershipRow>(`SELECT membership.id, membership.role, membership.capabilities
        FROM core.memberships membership
        JOIN core.tenants tenant ON tenant.id = membership.tenant_id
        WHERE membership.tenant_id = $1 AND membership.user_id = $2
          AND membership.status = 'ACTIVE' AND tenant.status = 'ACTIVE' LIMIT 1`,
      [tenantId, request.principal!.userId]),
    );
    const membership = result.rows[0];
    if (!membership) throw new DomainError('authorization', 'TENANT_ACCESS_DENIED');
    request.activeTenant = {
      tenantId,
      membershipId: membership.id,
      role: membership.role,
      capabilities: Object.freeze([...membership.capabilities]),
    };
    return true;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

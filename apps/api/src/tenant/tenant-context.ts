import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export type ActiveTenant = Readonly<{
  tenantId: string;
  membershipId: string;
  role: string;
  capabilities: readonly string[];
}>;
export type TenantRequest = FastifyRequest & { activeTenant?: ActiveTenant };

export const CurrentTenant = createParamDecorator((_data: unknown, context: ExecutionContext): ActiveTenant => {
  const tenant = context.switchToHttp().getRequest<TenantRequest>().activeTenant;
  if (!tenant) throw new Error('CurrentTenant used without TenantGuard.');
  return tenant;
});

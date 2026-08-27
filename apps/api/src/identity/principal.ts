import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export type Principal = Readonly<{ userId: string; email: string; displayName: string }>;
export type AuthenticatedRequest = FastifyRequest & { principal?: Principal };

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): Principal => {
  const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) throw new Error('CurrentPrincipal used without SessionGuard.');
  return principal;
});

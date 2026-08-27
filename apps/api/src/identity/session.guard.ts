import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { DomainError } from '../common/domain-error';
import { ENVIRONMENT, type Environment } from '../config/environment';
import { DatabaseService } from '../database/database.service';
import type { AuthenticatedRequest } from './principal';
import { hashSessionToken } from './session-token';

type SessionRow = { user_id: string; email: string; display_name: string };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new DomainError('authentication', 'AUTHENTICATION_REQUIRED');
    }
    const token = authorization.slice(7);
    if (token.length < 32 || token.length > 256) throw new DomainError('authentication', 'INVALID_SESSION');

    const tokenHash = hashSessionToken(token, this.environment.sessionPepper);
    const result = await this.database.query<SessionRow>(
      `SELECT s.user_id, u.email, u.display_name
         FROM iam.sessions s
         JOIN iam.users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.status = 'ACTIVE'
        LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('authentication', 'INVALID_SESSION');
    request.principal = { userId: row.user_id, email: row.email, displayName: row.display_name };
    return true;
  }
}

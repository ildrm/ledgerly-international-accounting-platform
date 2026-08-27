import { Inject, Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DomainError } from '../common/domain-error';
import { ENVIRONMENT, type Environment } from '../config/environment';
import { DatabaseService } from '../database/database.service';
import type { LoginInput, LocalizationPreferenceInput, RegisterInput } from './identity.schemas';
import type { Principal } from './principal';
import { createSessionToken, hashSessionToken } from './session-token';

type UserRow = { id: string; email: string; display_name: string; password_hash: string; status: string };

@Injectable()
export class IdentityService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  async register(input: RegisterInput, userAgent: string | undefined, ipAddress: string): Promise<object> {
    const userId = randomUUID();
    const passwordHash = await hash(input.password, {
      type: argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });

    try {
      return await this.database.transaction(async (client) => {
        await client.query(
          `INSERT INTO iam.users (id, email, display_name, password_hash, status)
           VALUES ($1, $2, $3, $4, 'ACTIVE')`,
          [userId, input.email, input.displayName, passwordHash],
        );
        await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
        await client.query(
          `INSERT INTO core.user_localization_preferences
             (user_id, ui_locale, format_locale, time_zone, calendar, numbering_system)
           VALUES ($1, $2, $2, 'UTC', 'gregory', 'latn')`,
          [userId, input.locale],
        );
        const session = await this.issueSession(client, userId, userAgent, ipAddress);
        await client.query(
          `INSERT INTO audit.events (actor_user_id, event_type, entity_type, entity_id, metadata)
           VALUES ($1, 'IDENTITY.USER_REGISTERED', 'USER', $1, jsonb_build_object('email', $2::text))`,
          [userId, input.email],
        );
        return { user: { id: userId, email: input.email, displayName: input.displayName }, ...session };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('conflict', 'EMAIL_ALREADY_REGISTERED');
      throw error;
    }
  }

  async login(input: LoginInput, userAgent: string | undefined, ipAddress: string): Promise<object> {
    const result = await this.database.query<UserRow>(
      `SELECT id, email, display_name, password_hash, status FROM iam.users WHERE lower(email) = lower($1) LIMIT 1`,
      [input.email],
    );
    const user = result.rows[0];
    const valid = user ? await verify(user.password_hash, input.password) : await this.consumeEquivalentPasswordWork(input.password);
    if (!user || !valid || user.status !== 'ACTIVE') throw new DomainError('authentication', 'INVALID_CREDENTIALS');

    return this.database.transaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      const session = await this.issueSession(client, user.id, userAgent, ipAddress);
      await client.query(
        `INSERT INTO audit.events (actor_user_id, event_type, entity_type, entity_id, metadata)
         VALUES ($1, 'IDENTITY.LOGIN_SUCCEEDED', 'USER', $1, '{}'::jsonb)`,
        [user.id],
      );
      return { user: { id: user.id, email: user.email, displayName: user.display_name }, ...session };
    });
  }

  async logout(rawToken: string, principal: Principal): Promise<void> {
    const tokenHash = hashSessionToken(rawToken, this.environment.sessionPepper);
    await this.database.userTransaction(principal.userId, async (client) => {
      await client.query(`UPDATE iam.sessions SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`, [tokenHash, principal.userId]);
      await client.query(
        `INSERT INTO audit.events (actor_user_id, event_type, entity_type, entity_id, metadata)
         VALUES ($1, 'IDENTITY.SESSION_REVOKED', 'USER', $1, '{}'::jsonb)`,
        [principal.userId],
      );
    });
  }

  async getProfile(principal: Principal): Promise<object> {
    const result = await this.database.userTransaction(principal.userId, (client) => client.query<{
      ui_locale: string; format_locale: string; time_zone: string; calendar: string; numbering_system: string;
    }>(`SELECT ui_locale, format_locale, time_zone, calendar, numbering_system
         FROM core.user_localization_preferences WHERE user_id = $1`, [principal.userId]));
    return { ...principal, localization: result.rows[0] ?? null };
  }

  async updateLocalization(principal: Principal, input: LocalizationPreferenceInput): Promise<object> {
    const result = await this.database.userTransaction(principal.userId, (client) => client.query<{
      ui_locale: string; format_locale: string; time_zone: string; calendar: string; numbering_system: string;
    }>(
      `INSERT INTO core.user_localization_preferences
         (user_id, ui_locale, format_locale, time_zone, calendar, numbering_system)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         ui_locale = EXCLUDED.ui_locale, format_locale = EXCLUDED.format_locale,
         time_zone = EXCLUDED.time_zone, calendar = EXCLUDED.calendar,
         numbering_system = EXCLUDED.numbering_system, revision = core.user_localization_preferences.revision + 1,
         updated_at = now()
       RETURNING ui_locale, format_locale, time_zone, calendar, numbering_system`,
      [principal.userId, input.uiLocale, input.formatLocale, input.timeZone, input.calendar, input.numberingSystem],
    ));
    return result.rows[0] ?? input;
  }

  private async issueSession(client: PoolClient, userId: string, userAgent: string | undefined, ipAddress: string): Promise<{ sessionToken: string; expiresAt: string }> {
    const sessionToken = createSessionToken();
    const expiresAt = new Date(Date.now() + this.environment.sessionTtlHours * 3_600_000);
    await client.query(
      `INSERT INTO iam.sessions (id, user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6::inet)`,
      [randomUUID(), userId, hashSessionToken(sessionToken, this.environment.sessionPepper), expiresAt, userAgent?.slice(0, 512) ?? null, ipAddress],
    );
    return { sessionToken, expiresAt: expiresAt.toISOString() };
  }

  private async consumeEquivalentPasswordWork(password: string): Promise<boolean> {
    const synthetic = '$argon2id$v=19$m=65536,t=3,p=1$YWNjb3VudGluZy1zYWx0LTEyMzQ1Ng$AKGLjRIEYljQ7bDN6xJm3xiZ9Lg0bv8m33M4Vu7SR1I';
    try { return await verify(synthetic, password); } catch { return false; }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { ConfigurationModule } from './config/configuration.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { TenantModule } from './tenant/tenant.module';
import { LedgerModule } from './ledger/ledger.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { RedisThrottlerStorage } from './rate-limit/redis-throttler.storage';
import { FiscalPeriodModule } from './fiscal-period/fiscal-period.module';

@Module({
  imports: [
    ConfigurationModule,
    RateLimitModule,
    ThrottlerModule.forRootAsync({
      imports: [RateLimitModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          { name: 'default', ttl: 60_000, limit: 120 },
          {
            name: 'account',
            ttl: 5 * 60_000,
            limit: 20,
            blockDuration: 15 * 60_000,
            skipIf: (context) => context.switchToHttp().getRequest<{ url?: string }>().url !== '/api/v1/identity/login',
            getTracker: (request) => {
              const body = request.body as { email?: unknown } | undefined;
              const identity = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : `ip:${String(request.ip)}`;
              return createHash('sha256').update(identity).digest('hex');
            },
          },
        ],
      }),
    }),
    DatabaseModule,
    HealthModule,
    IdentityModule,
    TenantModule,
    LedgerModule,
    FiscalPeriodModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseService } from '../database/database.service';
import { RedisThrottlerStorage } from '../rate-limit/redis-throttler.storage';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly rateLimits: RedisThrottlerStorage,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  live() { return { status: 'ok' as const }; }

  @Get('ready')
  @ApiOperation({ summary: 'Dependency readiness probe' })
  async ready() {
    const [database, redis] = await Promise.all([this.database.isReady(), this.rateLimits.isReady()]);
    if (!database || !redis) throw new ServiceUnavailableException({
      status: 'not-ready',
      dependencies: { database: database ? 'up' : 'down', redis: redis ? 'up' : 'down' },
    });
    return { status: 'ready' as const, dependencies: { database: 'up' as const, redis: 'up' as const } };
  }
}

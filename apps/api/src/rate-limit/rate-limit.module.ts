import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../config/configuration.module';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  imports: [ConfigurationModule],
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class RateLimitModule {}

import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { createClient } from 'redis';
import { ENVIRONMENT, type Environment } from '../config/environment';

const INCREMENT_SCRIPT = `
local hitKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local activeBlockTtl = redis.call('PTTL', blockKey)
if activeBlockTtl > 0 then
  local currentHits = tonumber(redis.call('GET', hitKey) or (limit + 1))
  local hitTtl = redis.call('PTTL', hitKey)
  return {currentHits, math.max(hitTtl, 0), 1, activeBlockTtl}
end

local hits = redis.call('INCR', hitKey)
if hits == 1 then
  redis.call('PEXPIRE', hitKey, ttl)
end
local hitTtl = redis.call('PTTL', hitKey)

if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  return {hits, math.max(hitTtl, 0), 1, blockDuration}
end

return {hits, math.max(hitTtl, 0), 0, 0}
`;

type StorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly client;
  private connection: Promise<void> | undefined;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.client = createClient({
      url: environment.redisUrl,
      socket: {
        connectTimeout: 3_000,
        reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 3_000),
      },
    });
    this.client.on('error', (error) => this.logger.error('Redis rate-limit connection error', error));
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<StorageRecord> {
    await this.ensureConnected();
    const namespacedKey = `ledgerly:throttle:${throttlerName}:${key}`;
    const raw = await this.client.sendCommand([
      'EVAL',
      INCREMENT_SCRIPT,
      '2',
      namespacedKey,
      `${namespacedKey}:blocked`,
      String(ttl),
      String(limit),
      String(blockDuration),
    ]);
    if (!Array.isArray(raw) || raw.length !== 4) {
      throw new Error('Redis returned an invalid throttler response.');
    }
    const [totalHits, ttlMilliseconds, blocked, blockMilliseconds] = raw.map(Number);
    if ([totalHits, ttlMilliseconds, blocked, blockMilliseconds].some((value) => !Number.isFinite(value))) {
      throw new Error('Redis returned a non-numeric throttler response.');
    }
    return {
      totalHits: totalHits ?? 0,
      timeToExpire: Math.ceil((ttlMilliseconds ?? 0) / 1_000),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.ceil((blockMilliseconds ?? 0) / 1_000),
    };
  }

  async isReady(): Promise<boolean> {
    try {
      await this.ensureConnected();
      return await this.client.ping() === 'PONG';
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) await this.client.close();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isReady) return;
    this.connection ??= this.client.connect()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.connection = undefined;
        throw error;
      });
    await this.connection;
  }
}

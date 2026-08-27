import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../src/config/environment';
import { RedisThrottlerStorage } from '../../src/rate-limit/redis-throttler.storage';

describe('distributed rate-limit storage', () => {
  const environment = loadEnvironment(process.env);
  const firstReplica = new RedisThrottlerStorage(environment);
  const secondReplica = new RedisThrottlerStorage(environment);

  beforeAll(async () => {
    expect(await firstReplica.isReady()).toBe(true);
    expect(await secondReplica.isReady()).toBe(true);
  });

  afterAll(async () => {
    await Promise.all([
      firstReplica.onApplicationShutdown(),
      secondReplica.onApplicationShutdown(),
    ]);
  });

  it('shares counters and blocks consistently across API replicas', async () => {
    const key = `integration:${randomUUID()}`;
    const first = await firstReplica.increment(key, 30_000, 2, 45_000, 'replica-test');
    const second = await secondReplica.increment(key, 30_000, 2, 45_000, 'replica-test');
    const blocked = await firstReplica.increment(key, 30_000, 2, 45_000, 'replica-test');
    const observedBySecondReplica = await secondReplica.increment(key, 30_000, 2, 45_000, 'replica-test');

    expect(first).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(second).toMatchObject({ totalHits: 2, isBlocked: false });
    expect(blocked).toMatchObject({ totalHits: 3, isBlocked: true });
    expect(observedBySecondReplica).toMatchObject({ totalHits: 3, isBlocked: true });
    expect(observedBySecondReplica.timeToBlockExpire).toBeGreaterThan(0);
  });
});

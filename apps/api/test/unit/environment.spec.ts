import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../src/config/environment';

describe('environment validation', () => {
  it('requires a strong session pepper outside development and test', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production' })).toThrow(/SESSION_PEPPER/u);
    expect(loadEnvironment({
      NODE_ENV: 'production',
      SESSION_PEPPER: 'production-pepper-with-at-least-32-characters',
      DATABASE_URL: 'postgresql://user:pass@example.test:5432/ledgerly',
      REDIS_URL: 'rediss://cache.example.test:6379',
    }).nodeEnv).toBe('production');
  });

  it('parses and normalizes an origin allowlist', () => {
    const environment = loadEnvironment({ CORS_ORIGINS: 'https://one.example, https://two.example' });
    expect(environment.corsOrigins).toEqual(['https://one.example', 'https://two.example']);
  });

  it('does not trust forwarded client addresses unless exact proxy ranges are configured', () => {
    expect(loadEnvironment({}).trustedProxyRanges).toBe(false);
    expect(loadEnvironment({
      TRUST_PROXY: '127.0.0.1, 10.20.0.0/16, ::1, 2001:db8::/32',
    }).trustedProxyRanges).toEqual(['127.0.0.1', '10.20.0.0/16', '::1', '2001:db8::/32']);

    for (const invalid of ['true', '*', 'proxy.example.test', '10.0.0.0/33', '2001:db8::/129', '127.0.0.1,']) {
      expect(() => loadEnvironment({ TRUST_PROXY: invalid })).toThrow(/TRUST_PROXY/u);
    }
  });
});

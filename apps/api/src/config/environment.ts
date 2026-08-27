import { z } from 'zod';
import { isIP } from 'node:net';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().default('postgresql://ledgerly:ledgerly@localhost:5432/ledgerly'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SESSION_PEPPER: z.string().min(32).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(168),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Environment = Readonly<{
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  host: string;
  databaseUrl: string;
  databasePoolMax: number;
  redisUrl: string;
  sessionPepper: string;
  sessionTtlHours: number;
  corsOrigins: readonly string[];
  trustedProxyRanges: false | readonly string[];
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.parse(source);
  const protectedEnvironment = parsed.NODE_ENV === 'production' || parsed.NODE_ENV === 'staging';
  if (protectedEnvironment && !parsed.SESSION_PEPPER) {
    throw new Error('SESSION_PEPPER must contain at least 32 characters in staging and production.');
  }
  if (protectedEnvironment && !source.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in staging and production.');
  }
  if (protectedEnvironment && !source.REDIS_URL) {
    throw new Error('REDIS_URL is required in staging and production.');
  }

  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    databaseUrl: parsed.DATABASE_URL,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    redisUrl: parsed.REDIS_URL,
    sessionPepper: parsed.SESSION_PEPPER ?? 'ledgerly-development-session-pepper',
    sessionTtlHours: parsed.SESSION_TTL_HOURS,
    corsOrigins: parsed.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
    trustedProxyRanges: parseTrustedProxyRanges(parsed.TRUST_PROXY),
    logLevel: parsed.LOG_LEVEL,
  });
}

function parseTrustedProxyRanges(rawValue: string): false | readonly string[] {
  const value = rawValue.trim();
  if (value === '' || value.toLowerCase() === 'false') return false;

  const ranges = value.split(',').map((entry) => entry.trim());
  if (ranges.some((entry) => entry === '') || ranges.some((entry) => !isIpAddressOrCidr(entry))) {
    throw new Error('TRUST_PROXY must be false or a comma-separated list of exact IP addresses/CIDR ranges.');
  }
  return Object.freeze(ranges);
}

function isIpAddressOrCidr(value: string): boolean {
  if (isIP(value) !== 0) return true;
  const separator = value.lastIndexOf('/');
  if (separator <= 0 || separator === value.length - 1) return false;
  const address = value.slice(0, separator);
  const prefix = value.slice(separator + 1);
  if (!/^\d{1,3}$/u.test(prefix)) return false;
  const family = isIP(address);
  const bits = Number(prefix);
  return (family === 4 && bits <= 32) || (family === 6 && bits <= 128);
}

export const ENVIRONMENT = Symbol('ENVIRONMENT');

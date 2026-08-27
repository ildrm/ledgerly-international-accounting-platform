import 'server-only';
import { isOpaqueSessionToken, parseApiBaseUrl } from './gateway-policy';
import type { SessionUser, TenantCompanyListResult } from './runtime-api';

export type UpstreamLoginResult = Readonly<{
  sessionToken: string;
  expiresAt: string;
  user: SessionUser;
}>;

export function apiBaseUrl(
  rawValue: string | undefined,
  requireHttps = process.env.NODE_ENV === 'production',
): URL {
  return parseApiBaseUrl(rawValue, requireHttps);
}

export function parseUpstreamLogin(value: unknown): UpstreamLoginResult {
  if (!isRecord(value) || !isRecord(value.user)) throw new Error('INVALID_UPSTREAM_LOGIN_RESPONSE');
  const expiresAt = requiredString(value.expiresAt, 100);
  const expires = new Date(expiresAt);
  if (!Number.isFinite(expires.getTime()) || expires.toISOString() !== expiresAt) {
    throw new Error('INVALID_UPSTREAM_LOGIN_RESPONSE');
  }
  return Object.freeze({
    sessionToken: requiredSessionToken(value.sessionToken),
    expiresAt: expires.toISOString(),
    user: Object.freeze({
      id: requiredString(value.user.id, 100),
      email: requiredString(value.user.email, 254),
      displayName: requiredString(value.user.displayName, 120),
    }),
  });
}

export function parseUpstreamProfile(value: unknown): Readonly<{ user: SessionUser }> {
  if (!isRecord(value)) throw new Error('INVALID_UPSTREAM_PROFILE_RESPONSE');
  return Object.freeze({
    user: Object.freeze({
      id: requiredString(value.userId, 100),
      email: requiredString(value.email, 254),
      displayName: requiredString(value.displayName, 120),
    }),
  });
}

export function parseLoginInput(value: unknown): Readonly<{ email: string; password: string }> | null {
  if (!isRecord(value)) return null;
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  const password = typeof value.password === 'string' ? value.password : '';
  if (!email || email.length > 254 || !password || password.length > 128) return null;
  return Object.freeze({ email, password });
}

export function parseUpstreamCompanies(value: unknown): TenantCompanyListResult {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error('INVALID_UPSTREAM_COMPANY_RESPONSE');
  return Object.freeze({
    items: Object.freeze(value.items.map((item) => {
      if (!isRecord(item)) throw new Error('INVALID_UPSTREAM_COMPANY_RESPONSE');
      return Object.freeze({
        id: requiredString(item.id, 100),
        name: requiredString(item.name, 200),
        countryCode: requiredString(item.country_code, 2),
        baseCurrency: requiredString(item.base_currency, 3),
        timeZone: requiredString(item.time_zone, 100),
        status: requiredString(item.status, 32),
      });
    })),
  });
}

function requiredString(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new Error('INVALID_UPSTREAM_RESPONSE');
  }
  return value;
}

function requiredSessionToken(value: unknown): string {
  if (!isOpaqueSessionToken(value)) throw new Error('INVALID_UPSTREAM_LOGIN_RESPONSE');
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

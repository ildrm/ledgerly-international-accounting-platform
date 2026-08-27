import { NextResponse, type NextRequest } from 'next/server';
import { readBoundedUtf8Body } from '@/app/body-limit';
import {
  expectedApplicationOrigin,
  isOpaqueSessionToken,
  isJsonMediaType,
  runtimeSessionCookieName,
} from '@/app/gateway-policy';
import { readPlatformIdentity, PLATFORM_IDENTITY_HEADERS } from '@/app/platform-identity';
import { parseProblemPayload, type ApiProblem } from '@/app/runtime-api';
import { apiBaseUrl } from '@/app/upstream-contract';

const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BYTES = 8_192;
const MAX_RESPONSE_BYTES = 1_048_576;

export function requirePlatformIdentity(request: NextRequest): NextResponse | null {
  if (isExplicitLocalDevelopment()) return null;
  if (readPlatformIdentity(request.headers)) return null;
  return problemResponse(localProblem(401, 'PLATFORM_AUTHENTICATION_REQUIRED'));
}

export function requireTrustedOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  const expectedOrigin = configuredAppOrigin(request);
  if (!origin || !expectedOrigin || origin !== expectedOrigin) {
    return problemResponse(localProblem(403, 'UNTRUSTED_REQUEST_ORIGIN'));
  }
  return null;
}

export function readSessionToken(request: NextRequest): string | null {
  const value = request.cookies.get(sessionCookieName())?.value;
  return isOpaqueSessionToken(value) ? value : null;
}

export function attachSessionCookie(
  response: NextResponse,
  sessionToken: string,
  expiresAt: string,
): NextResponse {
  response.cookies.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(sessionCookieName(), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function readSmallJson(request: NextRequest): Promise<unknown> {
  if (!isJsonMediaType(request.headers.get('content-type'), false)) return undefined;
  const text = await readBoundedUtf8Body(
    request.body,
    request.headers.get('content-length'),
    MAX_REQUEST_BYTES,
  );
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function readUpstreamJson(response: Response): Promise<unknown> {
  if (!isJsonMediaType(response.headers.get('content-type'), true)) return undefined;
  const text = await readBoundedUtf8Body(
    response.body,
    response.headers.get('content-length'),
    MAX_RESPONSE_BYTES,
  );
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function fetchUpstream(
  path: string,
  init: Readonly<{
    method?: 'GET' | 'POST';
    body?: string;
    sessionToken?: string;
    tenantId?: string;
  }> = {},
): Promise<Response> {
  const base = apiBaseUrl(process.env.LEDGERLY_API_BASE_URL);
  const url = new URL(path.replace(/^\/+/, ''), base);
  return fetch(url, {
    method: init.method ?? 'GET',
    body: init.body,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: {
      accept: 'application/json, application/problem+json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.sessionToken ? { authorization: `Bearer ${init.sessionToken}` } : {}),
      ...(init.tenantId ? { 'x-tenant-id': init.tenantId } : {}),
    },
  });
}

export async function relayUpstreamProblem(response: Response): Promise<NextResponse> {
  const value = await readUpstreamJson(response);
  return problemResponse(parseProblemPayload(value, response.status));
}

export function unavailableResponse(): NextResponse {
  return problemResponse(localProblem(503, 'ACCOUNTING_SERVICE_UNAVAILABLE'));
}

export function invalidResponse(): NextResponse {
  return problemResponse(localProblem(502, 'INVALID_ACCOUNTING_SERVICE_RESPONSE'));
}

export function authenticationRequiredResponse(): NextResponse {
  return problemResponse(localProblem(401, 'AUTHENTICATION_REQUIRED'));
}

export function validationResponse(): NextResponse {
  return problemResponse(localProblem(400, 'VALIDATION_FAILED'));
}

export function jsonResponse(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: responseHeaders('application/json; charset=utf-8'),
  });
}

export function emptyResponse(status = 204): NextResponse {
  return new NextResponse(null, { status, headers: responseHeaders() });
}

function problemResponse(problem: ApiProblem): NextResponse {
  return NextResponse.json(problem, {
    status: problem.status,
    headers: responseHeaders('application/problem+json; charset=utf-8'),
  });
}

function localProblem(status: number, code: string): ApiProblem {
  return Object.freeze({
    type: `https://docs.ledgerly.app/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    title: code,
    status,
    code,
    messageKey: `errors.${code}`,
    fieldErrors: Object.freeze([]),
  });
}

function responseHeaders(contentType?: string): HeadersInit {
  return {
    ...(contentType ? { 'content-type': contentType } : {}),
    'cache-control': 'no-store, private',
    pragma: 'no-cache',
    vary: `Cookie, ${PLATFORM_IDENTITY_HEADERS.userId}, ${PLATFORM_IDENTITY_HEADERS.email}`,
    'x-content-type-options': 'nosniff',
  };
}

function isExplicitLocalDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LEDGERLY_ALLOW_LOCAL_AUTH === 'true';
}

function configuredAppOrigin(request: NextRequest): string | null {
  return expectedApplicationOrigin(
    process.env.LEDGERLY_APP_ORIGIN,
    request.url,
    isExplicitLocalDevelopment(),
  );
}

function sessionCookieName(): string {
  return runtimeSessionCookieName(process.env.NODE_ENV === 'production');
}

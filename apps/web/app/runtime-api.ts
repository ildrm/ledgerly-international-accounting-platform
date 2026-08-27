export type ProblemFieldError = Readonly<{
  path: string;
  code: string;
}>;

export type ApiProblem = Readonly<{
  type: string;
  title: string;
  status: number;
  code: string;
  messageKey?: string;
  fieldErrors: readonly ProblemFieldError[];
  correlationId?: string;
}>;

export type SessionUser = Readonly<{
  id: string;
  email: string;
  displayName: string;
}>;

export type SessionResult = Readonly<{ user: SessionUser }>;

export type TenantRole = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'BOOKKEEPER' | 'AUDITOR';

export type TenantListItem = Readonly<{
  id: string;
  name: string;
  slug: string;
  membershipId: string;
  role: TenantRole;
  companyCount: number;
}>;

export type TenantListResult = Readonly<{ items: readonly TenantListItem[] }>;

export type TenantCompany = Readonly<{
  id: string;
  name: string;
  countryCode: string;
  baseCurrency: string;
  timeZone: string;
  status: string;
}>;

export type TenantCompanyListResult = Readonly<{ items: readonly TenantCompany[] }>;

export type LoginInput = Readonly<{ email: string; password: string }>;

export class RuntimeApiError extends Error {
  readonly problem: ApiProblem;

  constructor(problem: ApiProblem) {
    super(problem.code);
    this.name = 'RuntimeApiError';
    this.problem = problem;
  }
}

export class RuntimeApiUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('RUNTIME_API_UNAVAILABLE', options);
    this.name = 'RuntimeApiUnavailableError';
  }
}

export class RuntimeApiContractError extends Error {
  constructor() {
    super('INVALID_RUNTIME_API_RESPONSE');
    this.name = 'RuntimeApiContractError';
  }
}

export type RuntimeApi = Readonly<{
  login(input: LoginInput): Promise<SessionResult>;
  logout(): Promise<void>;
  getSession(): Promise<SessionResult>;
  listTenants(): Promise<TenantListResult>;
  listCompanies(tenantId: string): Promise<TenantCompanyListResult>;
}>;

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const problemCodePattern = /^[A-Z][A-Z0-9_]{0,79}$/u;
const tenantRoleValues = new Set<TenantRole>(['OWNER', 'ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AUDITOR']);

export function createRuntimeApi(fetchImplementation: FetchImplementation = fetch): RuntimeApi {
  return Object.freeze({
    login: async (input: LoginInput) => parseSessionResult(await requestJson(
      fetchImplementation,
      '/api/runtime/session',
      { method: 'POST', body: JSON.stringify(input) },
    )),
    logout: async () => {
      await requestJson(fetchImplementation, '/api/runtime/session', { method: 'DELETE' }, true);
    },
    getSession: async () => parseSessionResult(await requestJson(fetchImplementation, '/api/runtime/session')),
    listTenants: async () => parseTenantListResult(await requestJson(fetchImplementation, '/api/runtime/tenants')),
    listCompanies: async (tenantId: string) => parseCompanyListResult(await requestJson(
      fetchImplementation,
      `/api/runtime/tenants/${encodeURIComponent(tenantId)}/companies`,
    )),
  });
}

export function parseProblemPayload(payload: unknown, responseStatus: number): ApiProblem {
  const value = isRecord(payload) ? payload : {};
  const fieldErrors = Array.isArray(value.fieldErrors)
    ? value.fieldErrors.slice(0, 32).flatMap((item): ProblemFieldError[] => {
        if (!isRecord(item)) return [];
        const path = safeString(item.path, 200);
        const code = safeCode(item.code);
        return path && code ? [{ path, code }] : [];
      })
    : [];
  const code = safeCode(value.code) ?? fallbackProblemCode(responseStatus);
  return Object.freeze({
    type: safeProblemType(value.type) ?? 'about:blank',
    title: safeString(value.title, 200) ?? code,
    status: responseStatus,
    code,
    ...(safeString(value.messageKey, 200) ? { messageKey: safeString(value.messageKey, 200) } : {}),
    fieldErrors: Object.freeze(fieldErrors),
    ...(safeString(value.correlationId, 100) ? { correlationId: safeString(value.correlationId, 100) } : {}),
  });
}

export function parseSessionResult(value: unknown): SessionResult {
  if (!isRecord(value) || !isRecord(value.user)) throw new RuntimeApiContractError();
  return Object.freeze({ user: parseUser(value.user) });
}

export function parseTenantListResult(value: unknown): TenantListResult {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new RuntimeApiContractError();
  return Object.freeze({ items: Object.freeze(value.items.map(parseTenant)) });
}

export function parseCompanyListResult(value: unknown): TenantCompanyListResult {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new RuntimeApiContractError();
  return Object.freeze({ items: Object.freeze(value.items.map(parseCompany)) });
}

async function requestJson(
  fetchImplementation: FetchImplementation,
  path: string,
  init: RequestInit = {},
  allowEmpty = false,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImplementation(path, {
      ...init,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        accept: 'application/json, application/problem+json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new RuntimeApiUnavailableError({ cause });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new RuntimeApiError(parseProblemPayload(parseJson(text), response.status));
  }
  if (!text) {
    if (allowEmpty) return undefined;
    throw new RuntimeApiContractError();
  }
  const value = parseJson(text);
  if (value === undefined) throw new RuntimeApiContractError();
  return value;
}

function parseUser(value: Readonly<Record<string, unknown>>): SessionUser {
  return Object.freeze({
    id: requiredString(value.id, 100),
    email: requiredString(value.email, 254),
    displayName: requiredString(value.displayName, 120),
  });
}

function parseTenant(value: unknown): TenantListItem {
  if (!isRecord(value)) throw new RuntimeApiContractError();
  const role = value.role;
  const companyCount = value.companyCount;
  if (typeof role !== 'string' || !tenantRoleValues.has(role as TenantRole)) throw new RuntimeApiContractError();
  if (!Number.isSafeInteger(companyCount) || (companyCount as number) < 0) throw new RuntimeApiContractError();
  return Object.freeze({
    id: requiredString(value.id, 100),
    name: requiredString(value.name, 160),
    slug: requiredString(value.slug, 80),
    membershipId: requiredString(value.membershipId, 100),
    role: role as TenantRole,
    companyCount: companyCount as number,
  });
}

function parseCompany(value: unknown): TenantCompany {
  if (!isRecord(value)) throw new RuntimeApiContractError();
  return Object.freeze({
    id: requiredString(value.id, 100),
    name: requiredString(value.name, 200),
    countryCode: requiredString(value.countryCode, 2),
    baseCurrency: requiredString(value.baseCurrency, 3),
    timeZone: requiredString(value.timeZone, 100),
    status: requiredString(value.status, 32),
  });
}

function requiredString(value: unknown, maximumLength: number): string {
  const parsed = safeString(value, maximumLength);
  if (!parsed) throw new RuntimeApiContractError();
  return parsed;
}

function safeString(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) return undefined;
  return value;
}

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && problemCodePattern.test(value) ? value : undefined;
}

function safeProblemType(value: unknown): string | undefined {
  if (value === 'about:blank') return value;
  if (typeof value !== 'string' || value.length > 500) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function fallbackProblemCode(status: number): string {
  if (status === 401) return 'AUTHENTICATION_REQUIRED';
  if (status === 403) return 'ACCESS_DENIED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return 'REQUEST_FAILED';
}

function parseJson(text: string): unknown {
  if (!text || text.length > 65_536) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

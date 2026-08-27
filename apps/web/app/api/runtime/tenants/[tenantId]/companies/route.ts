import type { NextRequest } from 'next/server';
import { parseUpstreamCompanies } from '@/app/upstream-contract';
import {
  authenticationRequiredResponse,
  clearSessionCookie,
  fetchUpstream,
  invalidResponse,
  jsonResponse,
  readSessionToken,
  readUpstreamJson,
  relayUpstreamProblem,
  requirePlatformIdentity,
  unavailableResponse,
  validationResponse,
} from '../../../_lib/upstream';

type RouteContext = Readonly<{ params: Promise<{ tenantId: string }> }>;

export async function GET(request: NextRequest, context: RouteContext) {
  const platformProblem = requirePlatformIdentity(request);
  if (platformProblem) return platformProblem;
  const sessionToken = readSessionToken(request);
  if (!sessionToken) return authenticationRequiredResponse();
  const { tenantId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(tenantId)) {
    return validationResponse();
  }
  let upstream: Response;
  try {
    upstream = await fetchUpstream('api/v1/tenants/current/companies', { sessionToken, tenantId });
  } catch {
    return unavailableResponse();
  }
  if (!upstream.ok) {
    const response = await relayUpstreamProblem(upstream);
    return upstream.status === 401 ? clearSessionCookie(response) : response;
  }
  try {
    return jsonResponse(parseUpstreamCompanies(await readUpstreamJson(upstream)));
  } catch {
    return invalidResponse();
  }
}

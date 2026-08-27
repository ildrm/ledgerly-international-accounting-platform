import { parseTenantListResult } from '@/app/runtime-api';
import type { NextRequest } from 'next/server';
import {
  authenticationRequiredResponse,
  fetchUpstream,
  invalidResponse,
  jsonResponse,
  readSessionToken,
  readUpstreamJson,
  relayUpstreamProblem,
  clearSessionCookie,
  requirePlatformIdentity,
  unavailableResponse,
} from '../_lib/upstream';

export async function GET(request: NextRequest) {
  const platformProblem = requirePlatformIdentity(request);
  if (platformProblem) return platformProblem;
  const sessionToken = readSessionToken(request);
  if (!sessionToken) return authenticationRequiredResponse();
  let upstream: Response;
  try {
    upstream = await fetchUpstream('api/v1/tenants', { sessionToken });
  } catch {
    return unavailableResponse();
  }
  if (!upstream.ok) {
    const response = await relayUpstreamProblem(upstream);
    return upstream.status === 401 ? clearSessionCookie(response) : response;
  }
  try {
    return jsonResponse(parseTenantListResult(await readUpstreamJson(upstream)));
  } catch {
    return invalidResponse();
  }
}

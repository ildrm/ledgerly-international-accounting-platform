import type { NextRequest } from 'next/server';
import { parseLoginInput, parseUpstreamLogin, parseUpstreamProfile } from '@/app/upstream-contract';
import {
  attachSessionCookie,
  authenticationRequiredResponse,
  clearSessionCookie,
  emptyResponse,
  fetchUpstream,
  invalidResponse,
  jsonResponse,
  readSessionToken,
  readSmallJson,
  readUpstreamJson,
  relayUpstreamProblem,
  requirePlatformIdentity,
  requireTrustedOrigin,
  unavailableResponse,
  validationResponse,
} from '../_lib/upstream';

export async function GET(request: NextRequest) {
  const platformProblem = requirePlatformIdentity(request);
  if (platformProblem) return platformProblem;
  const sessionToken = readSessionToken(request);
  if (!sessionToken) return authenticationRequiredResponse();
  let upstream: Response;
  try {
    upstream = await fetchUpstream('api/v1/identity/me', { sessionToken });
  } catch {
    return unavailableResponse();
  }
  if (!upstream.ok) {
    const response = await relayUpstreamProblem(upstream);
    return upstream.status === 401 ? clearSessionCookie(response) : response;
  }
  try {
    return jsonResponse(parseUpstreamProfile(await readUpstreamJson(upstream)));
  } catch {
    return invalidResponse();
  }
}

export async function POST(request: NextRequest) {
  const platformProblem = requirePlatformIdentity(request);
  if (platformProblem) return platformProblem;
  const originProblem = requireTrustedOrigin(request);
  if (originProblem) return originProblem;
  const input = parseLoginInput(await readSmallJson(request));
  if (!input) return validationResponse();
  let upstream: Response;
  try {
    upstream = await fetchUpstream('api/v1/identity/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch {
    return unavailableResponse();
  }
  if (!upstream.ok) return relayUpstreamProblem(upstream);
  try {
    const login = parseUpstreamLogin(await readUpstreamJson(upstream));
    return attachSessionCookie(jsonResponse({ user: login.user }), login.sessionToken, login.expiresAt);
  } catch {
    return invalidResponse();
  }
}

export async function DELETE(request: NextRequest) {
  const platformProblem = requirePlatformIdentity(request);
  if (platformProblem) return platformProblem;
  const originProblem = requireTrustedOrigin(request);
  if (originProblem) return originProblem;
  const sessionToken = readSessionToken(request);
  if (!sessionToken) return clearSessionCookie(emptyResponse());
  let upstream: Response;
  try {
    upstream = await fetchUpstream('api/v1/identity/logout', { method: 'POST', sessionToken });
  } catch {
    return clearSessionCookie(unavailableResponse());
  }
  if (!upstream.ok && upstream.status !== 401) {
    return clearSessionCookie(await relayUpstreamProblem(upstream));
  }
  return clearSessionCookie(emptyResponse());
}

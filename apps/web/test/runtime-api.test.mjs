import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RuntimeApiContractError,
  RuntimeApiError,
  createRuntimeApi,
  parseProblemPayload,
} from '../app/runtime-api.ts';

describe('same-origin runtime API client', () => {
  it('keeps credentials on the same-origin BFF and never returns or forwards a token', async () => {
    const calls = [];
    const api = createRuntimeApi(async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({
        sessionToken: 'must-not-cross-the-bff-boundary',
        user: { id: 'user-1', email: 'owner@example.test', displayName: 'Owner' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const session = await api.login({ email: 'owner@example.test', password: 'not-persisted' });
    assert.deepEqual(session, { user: { id: 'user-1', email: 'owner@example.test', displayName: 'Owner' } });
    assert.equal('sessionToken' in session, false);
    assert.equal(calls[0].input, '/api/runtime/session');
    assert.equal(calls[0].init.credentials, 'include');
    assert.equal(new Headers(calls[0].init.headers).has('authorization'), false);
  });

  it('uses only relative BFF routes for every browser operation', async () => {
    const paths = [];
    const api = createRuntimeApi(async (input) => {
      const path = String(input);
      paths.push(path);
      if (path.endsWith('/companies')) return Response.json({ items: [] });
      if (path.endsWith('/tenants')) return Response.json({ items: [] });
      if (path === '/api/runtime/session') {
        return Response.json({ user: { id: 'u', email: 'u@example.test', displayName: 'User' } });
      }
      throw new Error(`Unexpected path ${path}`);
    });
    await api.getSession();
    await api.listTenants();
    await api.listCompanies('20000000-0000-4000-8000-000000000001');
    assert.deepEqual(paths, [
      '/api/runtime/session',
      '/api/runtime/tenants',
      '/api/runtime/tenants/20000000-0000-4000-8000-000000000001/companies',
    ]);
    assert.ok(paths.every((path) => path.startsWith('/api/runtime/')));
  });

  it('sanitizes upstream problems and rejects malformed success contracts', async () => {
    const problem = parseProblemPayload({
      type: 'http://unsafe.example/problem',
      title: 'Known title',
      status: 418,
      code: 'ACCESS_DENIED',
      message: 'database detail must not survive',
      correlationId: 'req-safe',
      fieldErrors: [{ path: 'email', code: 'INVALID_EMAIL', secret: 'removed' }],
    }, 403);
    assert.deepEqual(problem, {
      type: 'about:blank',
      title: 'Known title',
      status: 403,
      code: 'ACCESS_DENIED',
      fieldErrors: [{ path: 'email', code: 'INVALID_EMAIL' }],
      correlationId: 'req-safe',
    });
    assert.equal('message' in problem, false);

    const invalid = createRuntimeApi(async () => Response.json({ user: { id: '', email: 'x', displayName: 'x' } }));
    await assert.rejects(invalid.getSession(), RuntimeApiContractError);
    const denied = createRuntimeApi(async () => Response.json({ code: 'ACCESS_DENIED' }, { status: 403 }));
    await assert.rejects(denied.getSession(), (error) => (
      error instanceof RuntimeApiError && error.problem.status === 403 && error.problem.code === 'ACCESS_DENIED'
    ));
  });
});

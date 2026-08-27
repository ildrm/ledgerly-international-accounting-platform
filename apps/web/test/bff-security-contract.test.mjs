import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const upstreamPath = new URL('../app/api/runtime/_lib/upstream.ts', import.meta.url);
const contractPath = new URL('../app/upstream-contract.ts', import.meta.url);

describe('hosted BFF security contract', () => {
  it('keeps upstream configuration server-only and the session cookie host-only', async () => {
    const [upstream, contract] = await Promise.all([
      readFile(upstreamPath, 'utf8'),
      readFile(contractPath, 'utf8'),
    ]);
    assert.match(contract, /import 'server-only'/u);
    assert.match(upstream, /process\.env\.LEDGERLY_API_BASE_URL/u);
    assert.match(upstream, /process\.env\.LEDGERLY_APP_ORIGIN/u);
    assert.doesNotMatch(`${upstream}\n${contract}`, /NEXT_PUBLIC_LEDGERLY/u);
    assert.match(upstream, /httpOnly:\s*true/u);
    assert.match(upstream, /sameSite:\s*'lax'/u);
    assert.match(upstream, /secure:\s*process\.env\.NODE_ENV === 'production'/u);
    assert.doesNotMatch(upstream, /domain\s*:/u);
  });
});

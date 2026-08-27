import { describe, expect, it } from 'vitest';
import { createSessionToken, hashSessionToken } from '../../src/identity/session-token';

describe('opaque sessions', () => {
  it('issues 256-bit base64url tokens and stores deterministic keyed hashes', () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(hashSessionToken(token, 'a'.repeat(32))).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashSessionToken(token, 'a'.repeat(32))).toBe(hashSessionToken(token, 'a'.repeat(32)));
    expect(hashSessionToken(token, 'a'.repeat(32))).not.toBe(hashSessionToken(token, 'b'.repeat(32)));
  });
});

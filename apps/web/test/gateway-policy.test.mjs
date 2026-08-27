import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expectedApplicationOrigin,
  isJsonMediaType,
  isOpaqueSessionToken,
  parseApiBaseUrl,
  runtimeSessionCookieName,
} from '../app/gateway-policy.ts';

describe('runtime gateway policy', () => {
  it('requires a credential-free HTTPS upstream in production', () => {
    assert.equal(parseApiBaseUrl('https://api.example.test/v1', true).href, 'https://api.example.test/v1/');
    assert.throws(() => parseApiBaseUrl('http://api.example.test', true), /HTTPS/u);
    assert.throws(() => parseApiBaseUrl('https://user:secret@api.example.test', true), /credential-free/u);
    assert.throws(() => parseApiBaseUrl('https://api.example.test?token=secret', true), /credential-free/u);
  });

  it('never trusts request host metadata for a production origin', () => {
    assert.equal(expectedApplicationOrigin(undefined, 'https://attacker.test/path', false), null);
    assert.equal(
      expectedApplicationOrigin('https://ledgerly.example.test', 'https://attacker.test/path', false),
      'https://ledgerly.example.test',
    );
    assert.equal(expectedApplicationOrigin(undefined, 'http://localhost:3000/path', true), 'http://localhost:3000');
    assert.equal(expectedApplicationOrigin('https://ledgerly.example.test/path', 'https://ignored.test', false), null);
  });

  it('enforces host-prefixed production cookies, JSON media types, and printable opaque tokens', () => {
    assert.equal(runtimeSessionCookieName(true), '__Host-ledgerly_session');
    assert.equal(runtimeSessionCookieName(false), 'ledgerly_session');
    assert.equal(isJsonMediaType('application/json; charset=utf-8', false), true);
    assert.equal(isJsonMediaType('text/plain', true), false);
    assert.equal(isJsonMediaType('application/vnd.api+json', true), true);
    assert.equal(isOpaqueSessionToken('a'.repeat(43)), true);
    assert.equal(isOpaqueSessionToken('short'), false);
    assert.equal(isOpaqueSessionToken(`${'a'.repeat(40)}\n`), false);
  });
});

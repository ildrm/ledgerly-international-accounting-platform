import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readPlatformIdentity } from '../app/platform-identity.ts';

describe('Sites platform identity contract', () => {
  it('requires both stable platform identity headers and safely decodes the display name', () => {
    assert.equal(readPlatformIdentity(new Headers({ 'oai-authenticated-user-id': 'user-1' })), null);
    assert.deepEqual(readPlatformIdentity(new Headers({
      'oai-authenticated-user-id': 'user-1',
      'oai-authenticated-user-email': 'owner@example.test',
      'oai-authenticated-user-full-name': 'Amina%20Mato',
      'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    })), {
      userId: 'user-1',
      email: 'owner@example.test',
      fullName: 'Amina Mato',
      displayName: 'Amina Mato',
    });
  });
});

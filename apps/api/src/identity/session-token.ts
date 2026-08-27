import { createHmac, randomBytes } from 'node:crypto';

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string, pepper: string): string {
  return createHmac('sha256', pepper).update(token).digest('hex');
}

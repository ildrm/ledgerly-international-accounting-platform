# ADR 0007: Use opaque revocable sessions

- Status: Accepted
- Date: 2026-08-26

## Decision

Issue 256-bit random bearer tokens, store only a peppered hash, expire them, and support immediate revocation. Passwords use Argon2id with memory-hard settings.

## Consequences

Session lookup is a database operation and can be revoked immediately. Tokens and credentials are redacted. Production pepper rotation needs a documented multi-key transition.

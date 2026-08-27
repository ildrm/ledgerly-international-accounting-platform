# ADR 0008: Combine idempotent commands with a transactional outbox

- Status: Accepted
- Date: 2026-08-26

## Decision

Retryable financial commands claim a tenant/scope/key/request-hash record in the same transaction. External side effects originate from outbox rows committed with business state.

## Consequences

Same-key/same-payload requests replay the committed response; conflicting reuse fails. Workers must be at-least-once and provider operations idempotent or reconciled. Outbox monitoring and dead-letter operations are required before production integrations.

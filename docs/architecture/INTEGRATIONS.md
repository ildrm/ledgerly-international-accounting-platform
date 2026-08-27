# Integration architecture

Provider adapters sit behind capability interfaces and never redefine accounting truth. Every request includes provider, tenant, correlation, idempotency, timeout, retry, circuit, and effective-date context. Webhooks are authenticated, replay protected, stored before processing, and handled idempotently.

External calls do not occur inside a ledger database transaction. The transaction commits an outbox event; a worker claims it with locking, calls the provider, records attempts and safe responses, and retries according to an operation-specific policy. Non-idempotent or legally final submissions require explicit states and human-visible reconciliation.

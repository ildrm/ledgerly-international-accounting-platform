# Security architecture

Trust boundaries exist at browser/API, API/provider, API/database, support/tenant, and CI/production. Authentication and tenant membership are separate guards. Roles constrain ledger maintenance and posting. Opaque sessions are hashed with a secret pepper, revocable, expiring, and redacted from logs.

The API uses schema validation, parameterized SQL, strict CORS, security headers, throttling, correlation IDs, and safe problem details. PostgreSQL adds RLS, grants, constraints, row locks, immutable triggers, append-only audit, and transactional outbox. Production requires managed secrets, TLS, database encryption, WAF/edge limits, central logs/metrics/traces, vulnerability scanning, and tested recovery.

# Tenant isolation

The authenticated session establishes `user_id`; active membership establishes `tenant_id` and role. Each tenant transaction sets `app.user_id`, `app.tenant_id`, and `app.correlation_id` locally on the PostgreSQL transaction. RLS policies use those settings and are forced even for table owners during verification.

Rules:

- never infer access from possession of a tenant UUID;
- never accept tenant ownership fields from untrusted payloads when context can supply them;
- use composite tenant foreign keys;
- authorize object access and action separately;
- test a valid outsider session against a real second tenant;
- scrub tenant context when jobs are reused and include it explicitly in outbox payloads.

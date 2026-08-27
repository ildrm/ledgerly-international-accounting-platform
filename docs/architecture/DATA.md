# Data architecture

PostgreSQL 18 is the system of record. Schemas separate `iam`, `core`, `ledger`, `audit`, and `integration`. UUIDs are externally safe identifiers; exact numerics preserve finance values; JSONB is limited to metadata/dimensions whose schema is validated at the boundary.

Tenant tables use forced RLS plus composite `(tenant_id, id)` uniqueness and foreign keys. The migrator owns schema objects; the runtime role has explicit DML grants and cannot bypass RLS. Migrations are checksum recorded and advisory locked.

Financial reports query posted journal lines, not cached operational totals. Derived read models may be added for performance only with provenance, freshness, reconciliation, and rebuild procedures. Redis and search indexes are disposable accelerators.

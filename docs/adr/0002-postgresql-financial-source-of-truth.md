# ADR 0002: PostgreSQL is the financial source of truth

- Status: Accepted
- Date: 2026-08-26

## Decision

Persist canonical accounting state in PostgreSQL. Redis, search, object storage metadata, analytics, and client caches are derived or supporting stores.

## Consequences

Reports must be reconstructible from posted ledger rows. Read models need reconciliation and rebuild procedures. Financial mutations rely on constraints, locks, RLS, and transactions rather than cache coordination.

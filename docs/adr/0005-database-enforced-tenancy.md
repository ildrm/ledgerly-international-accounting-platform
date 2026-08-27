# ADR 0005: Enforce tenant isolation in application and database

- Status: Accepted
- Date: 2026-08-26

## Decision

Require authenticated active membership in the API, pass tenant/user context transaction-locally, force RLS, and use composite tenant foreign keys with a non-owner `NOBYPASSRLS` runtime role.

## Consequences

Queries remain tenant-filtered for clarity even with RLS. Background jobs must establish context. Integration tests use two real users and tenants and fail if an outsider can read or mutate data.

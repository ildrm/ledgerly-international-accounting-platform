# ADR 0003: Exact decimal money and explicit rounding

- Status: Accepted
- Date: 2026-08-26

## Decision

Use canonical decimal strings at API boundaries, exact decimal/money domain objects in code, `numeric(38,12)` for amounts, and `numeric(38,18)` for rates. Never use binary floating point for financial calculations.

## Consequences

Currency and scale are part of the value. Rounding mode and boundary are mandatory policy. Database, domain, transport, import, export, and UI tests must include values beyond JavaScript’s safe integer range.

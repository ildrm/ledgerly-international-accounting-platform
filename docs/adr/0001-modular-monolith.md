# ADR 0001: Start as a modular monolith

- Status: Accepted
- Date: 2026-08-26

## Decision

Deploy a separate web app and API, but keep business modules in one API process and one PostgreSQL database with strict schema/module boundaries.

## Rationale and consequences

Posting, numbering, authorization, audit, and outbox creation require strong transactions. This reduces distributed-failure modes while the domain is forming. Modules must expose explicit contracts; extraction requires measured scale or organizational need and a documented consistency strategy.

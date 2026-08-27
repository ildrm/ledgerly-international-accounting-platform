# Changelog

All notable changes are recorded here. This project follows semantic-versioning intent before 1.0; no release is production-certified yet.

## [Unreleased]

### Added

- pnpm/Turborepo monorepo with multilingual web app, NestJS API, PostgreSQL database package, exact accounting package, and localization package;
- eleven runtime UI locales with Persian/Arabic RTL, persisted user format preferences, exact localized decimal/date/money utilities, and catalog-parity tests;
- reversible Gregorian/Jalali business-date conversion with Persian leap-boundary coverage;
- opaque Argon2id-backed identity/session flows and tenant/legal-entity/book/period onboarding;
- forced-RLS tenant model, exact immutable double-entry journals, reversal links, number sequences, audit log, idempotency, outbox, and trial balance;
- immutable sourced historical exchange-rate provenance, exact foreign-currency journal constraints, and migration `0003`;
- capability-checked fiscal-period creation, non-overlap protection, append-only close evidence/status history, honest subsystem-unavailable readiness, soft/hard close, privileged hard reopen, cycle-scoped attestations, and migrations `0004`/`0005`;
- exact standards-neutral management reporting for general-ledger detail, comparative income statements, and comparative balance sheets with deterministic drill-down provenance and no statutory-framework claim;
- same-origin authenticated web gateway with Sites platform identity as the outer gate, host-only HttpOnly accounting sessions, CSRF origin enforcement, bounded streaming bodies, sanitized errors, and translated session/tenant/company states for all eleven locales;
- atomic Redis-backed distributed IP and account throttling with cross-replica integration coverage;
- Docker local services, deterministic seed, OpenAPI/health endpoints, unit/integration contracts, CI, architecture/ADR/security/operations documentation, and section-level feature traceability.

### Verified

- root lint passes all 5 Turbo tasks;
- root typecheck passes all 5 Turbo tasks;
- root unit/contract verification passes all 8 Turbo tasks: accounting (24), localization (14), database static contracts (13), API unit (21), and web/runtime gateway (14), for 86 tests total;
- root integration verification passes all 5 Turbo tasks, including database live invariants (6) and API integration tests (15), for 21 tests total;
- the frozen lockfile installs reproducibly, the production audit reports no known vulnerabilities, and all 5 production-build tasks pass after the Next.js 16.3.3 security upgrade;
- Sites version 1 is deployed privately at `https://ledgerly-accounting.ildrmsd.chatgpt.site`.

### Known limitations

- Sales, purchasing, treasury, inventory, fixed assets, payroll, manufacturing, consolidation, statutory country packs, background workers, files, search, notifications, and AI workflows remain outside the verified slice.
- API/data-plane production infrastructure, provider credentials, backup/restore evidence, browser visual automation, penetration testing, and legal compliance certification are not complete.

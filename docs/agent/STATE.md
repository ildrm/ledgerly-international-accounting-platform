# Current implementation state

Last updated: 2026-08-27 (Asia/Tehran)

## Verified code surface

- Monorepo, pinned package manager, Turbo task graph, local Docker services.
- PostgreSQL schemas/migration/seed for identity, organization, ledger, audit, outbox, and idempotency.
- Nest API with safe configuration, health, problem details, identity/session/preferences, tenant membership/onboarding, accounts, journals, posting/reversal, trial balance, historical exchange rates, capability-checked fiscal-period creation/close/reopen workflows, and Redis-backed distributed throttling.
- Exact accounting domain package with immutable sourced FX-rate provenance, exact conversion/revaluation rules, deterministic general-ledger detail, comparative income statement, comparative balance sheet, report drill-down provenance, and comprehensive invariant tests.
- Localization package plus dashboard and runtime-access catalogs for all eleven locales; runtime switching, RTL document direction, and reversible Gregorian/Jalali business-date conversion.
- Same-origin web BFF with Sites platform identity as the outer production gate, an HttpOnly host-only accounting session cookie, origin enforcement, bounded request/response streaming, sanitized Problem Details, and localized session/tenant/company states. The opaque API token never enters client state or browser storage.
- Section-by-section traceability, optimized product spec, architecture, ADRs, threat model, compliance blockers, recovery contract, and CI.

## Verification evidence from the active workspace

- Migrations `0000` through `0005` have been applied successfully to the active PostgreSQL database. `0004` adds non-overlapping capability-checked fiscal-period administration and append-only close evidence/history; `0005` retains the atomic period lock used by posting without restoring direct runtime writes.
- API live/readiness returned success.
- Seeded trial balance reconstructed equal debit/credit totals.
- A separately registered valid user received `403 TENANT_ACCESS_DENIED` against the seeded tenant.
- Root lint passed all 5 Turbo tasks.
- Root typecheck passed all 5 Turbo tasks.
- Root unit/contract verification passed all 8 Turbo tasks: accounting 24 tests, localization 14, database static contracts 13, API unit tests 21, and web/runtime gateway tests 14 (86 tests total).
- Root integration verification passed all 5 Turbo tasks, including 6 live database invariants and 15 API integration tests (21 tests total).
- The frozen lockfile installs reproducibly, and the production dependency audit reports no known vulnerabilities after upgrading the web runtime to Next.js 16.3.3.
- The production build passed all 5 Turbo tasks, including a fresh Vinext client/RSC/SSR build.
- Sites version 1 is deployed with owner-only access at `https://ledgerly-accounting.ildrmsd.chatgpt.site`.

## Honest release statement

This is a production-oriented foundation/general-ledger vertical slice, not a completed international ERP or certified country pack. See `FEATURE-MATRIX.md` for every requirement and status.

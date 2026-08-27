# Optimized international accounting product specification

## 1. Purpose and corrected scope

Build an international, multi-tenant accounting platform whose first dependable product increment is an immutable double-entry general ledger. Expand to operational ERP domains only through explicitly accepted modules. A repository, screen, endpoint, or country-pack stub must never be reported as completed functionality.

The original master prompt is retained as the requirement inventory. This specification resolves its conflicts, adds the requested multilingual contract, and defines an executable delivery order. The [traceability matrix](../agent/FEATURE-MATRIX.md) maps every original numbered section to implementation truth.

## 2. Globalization contract

The system must support runtime UI-language switching for:

| Canonical locale | Language | Direction | Default formatting | Default calendar | Default digits |
|---|---|---|---|---|---|
| `en-US` | English | LTR | `en-US` | Gregorian | Latin |
| `fa-IR` | Persian | RTL | `fa-IR` | Persian | Extended Arabic-Indic |
| `de-DE` | German | LTR | `de-DE` | Gregorian | Latin |
| `tr-TR` | Turkish | LTR | `tr-TR` | Gregorian | Latin |
| `ar-SA` | Arabic | RTL | `ar-SA` | Gregorian | Arabic-Indic |
| `ru-RU` | Russian | LTR | `ru-RU` | Gregorian | Latin |
| `fr-FR` | French | LTR | `fr-FR` | Gregorian | Latin |
| `es-ES` | Spanish | LTR | `es-ES` | Gregorian | Latin |
| `it-IT` | Italian | LTR | `it-IT` | Gregorian | Latin |
| `zh-Hans-CN` | Simplified Chinese | LTR | `zh-CN` | Gregorian | Latin |
| `ja-JP` | Japanese | LTR | `ja-JP` | Gregorian | Latin |

The following preferences are independent and persisted per user: UI locale, formatting locale, IANA timezone, calendar (`gregory` or `persian`), and numbering system (`latn`, `arab`, or `arabext`). Membership-level and device-level overrides may be added without changing this model. A user can therefore use an English UI with Persian dates and Persian digits, or Persian UI with Gregorian dates and Latin digits.

Requirements:

- Switching language updates visible content, `<html lang>`, document direction, navigation order, accessible labels, and formatting without signing out.
- Message catalogs have exact structural parity and no visible feature string is embedded in a component.
- Financial identifiers and mixed-direction values use bidi isolation; invisible directional controls are rejected from identifiers.
- Canonical storage uses Gregorian business dates (`YYYY-MM-DD`), UTC instants, IANA zone names, ISO 4217 currencies, and canonical decimal strings. Calendar and digit conversion are presentation concerns.
- Truncation, wrapping, focus order, tables, forms, printing, and keyboard behavior must be verified in Persian and Arabic as well as a representative long LTR locale (German or Russian).
- Translation does not imply tax, payroll, invoicing, or filing compliance. Each jurisdiction needs a separately versioned, sourced, tested country pack.

## 3. Tenancy and organization model

Canonical hierarchy: `User -> Membership -> Tenant -> Legal entity -> Branch -> Book -> Fiscal year/period`.

- A user may belong to many tenants; a tenant may contain many legal entities.
- Tenant onboarding creates the owner membership, first legal entity, primary statutory book, and current open fiscal period atomically.
- All tenant-owned rows include `tenant_id`; composite foreign keys prevent cross-tenant references.
- PostgreSQL RLS is forced on tenant tables. The application runtime role is `NOBYPASSRLS` and never owns schema objects.
- Tenant context is derived only after session authentication and active-membership authorization; a client-provided tenant ID is never trusted alone.
- Cross-tenant denial is an integration acceptance test, not a unit-test mock.

## 4. Accounting invariants

- Posted journals are immutable. Corrections create traceable, equal-and-opposite reversal journals.
- A posted journal contains two or more posting lines, exactly one positive debit or credit per line, non-zero equal totals, an open/authorized fiscal period, a unique document number, actor, instant, source, and audit event.
- Operational documents have lifecycle state and may create journal commands; reports reconstruct from posted journal lines only.
- Money uses currency-aware exact decimal objects. Rounding is explicit, documented, and occurs only at defined policy boundaries.
- Functional and transaction amounts, currency, and exchange rate are recorded per line. Full foreign-currency remeasurement and realized/unrealized gain workflows are a later accepted module.
- IRR is stored canonically. Toman is a presentation/input unit with exact 10:1 conversion and explicit labeling.
- Periods support open, soft-closed, and hard-closed behavior; overrides require reason and authorization.
- Number allocation occurs inside the posting transaction under row locking. Business retries use idempotency keys; external side effects use the transactional outbox.

## 5. Application modules

### Delivered foundation / ledger slice

Identity and opaque revocable sessions; localization preferences; tenant and legal-entity onboarding; roles; books and fiscal periods; chart of accounts; journal drafts; atomic posting; exact reversal; trial balance; audit log; outbox; idempotency; health endpoints; OpenAPI; and a multilingual responsive command-center shell.

### Ordered expansion

1. Ledger close controls, opening balances, dimensions, control-account reconciliation, financial statements, imports/exports, and accountant workflow.
2. Sales/receivables and purchasing/payables with document-to-ledger posting policies and end-to-end acceptance tests.
3. Treasury, bank reconciliation, inventory, fixed assets, projects, budgets, consolidation, multi-book and multi-currency close.
4. Payroll, manufacturing, contracting, CRM, POS, portals, automation, reporting builder, BI, document intelligence, offline/field sales, subscriptions, and developer platform.
5. Country and industry packs only after authoritative source registers, effective-date rules, credentials, provider sandboxes, and compliance acceptance evidence exist.

## 6. API and error contract

- Versioned REST endpoints under `/api/v1`; OpenAPI 3.1 is generated from the running API.
- Monetary values and exchange rates are decimal strings; dates and instants follow the canonical model above.
- Authentication uses an opaque high-entropy bearer token stored only as a keyed hash, revocable and expiring.
- Mutating financial commands require authorization, correlation ID, validation, audit evidence, and idempotency where retries are possible.
- Errors use `application/problem+json` with stable `code`, localized `messageKey`, safe parameters, field errors, instance, and correlation ID. Stack traces and secrets never cross the boundary.

## 7. Security and privacy baseline

Use least privilege, defense in depth, server-side authorization, rate limits, secret redaction, secure headers, strict CORS, prepared queries, dependency review, encrypted transport, provider-managed encryption at rest, malware-scanned uploads, append-only audit events, backup/restore exercises, and incident runbooks. High-risk finance operations require explicit confirmation and future segregation-of-duties policy. See the [threat model](../security/THREAT-MODEL.md).

## 8. Quality gates

A feature is accepted only when its domain rules, persistence, authorization, API, UI, localization, accessibility, audit behavior, idempotency/concurrency behavior, tests, observability, documentation, and traceability are complete at the claimed scope. Required gates include typecheck, lint, unit tests, real-PostgreSQL integration tests, migration-from-empty verification, production build, dependency audit, and representative browser/visual checks.

For accounting changes, property/invariant tests must cover balance, precision, reversal, immutability, period rules, idempotency, sequence concurrency, RLS isolation, and report reconstruction.

## 9. External decisions and blockers

The repository cannot invent legal filing formats, live bank behavior, government certificates, provider credentials, retention mandates, recovery objectives, or commercial pricing. Each item must be recorded in the [source register](../compliance/SOURCE-REGISTER.md) with jurisdiction, authority, publication/effective dates, version, owner, verification date, test evidence, and supersession status.

## 10. Definition of platform completion

“Platform complete” is reserved for the point at which every in-scope matrix row is accepted, external blockers are resolved or explicitly removed from scope, production infrastructure and recovery are exercised, final financial/security/UX/performance/documentation audits pass, and no known critical defect remains. Until then, releases state the exact verified slice.

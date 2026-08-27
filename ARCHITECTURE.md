# Ledgerly architecture

Ledgerly is a modular-monolith accounting platform with independently deployable web and API applications, a shared exact-arithmetic core, and PostgreSQL as the financial source of truth. The current release is a production-oriented foundation and general-ledger vertical slice; [feature truth](docs/agent/FEATURE-MATRIX.md) distinguishes that from the wider ERP program.

## System context

```text
Users / accountants / auditors
          |
          v
  Multilingual web application
          |
          v
 Versioned NestJS API ---- object storage / mail / future providers
          |
          +---- PostgreSQL (ledger, audit, RLS, outbox)
          +---- Redis (future cache/jobs; never ledger truth)
```

The canonical ownership hierarchy is:

```text
User -> Membership -> Tenant -> Legal entity -> Branch -> Book -> Fiscal period
```

Every financial aggregate carries `tenant_id`; cross-tenant foreign keys are composite. The runtime database role cannot bypass row-level security. Posted journals are append-only and are corrected through exact reversals.

## Core decisions

- UI language, formatting locale, timezone, calendar, numbering system, transaction currency, functional currency, and statutory jurisdiction are separate values.
- The eleven UI locales are `en-US`, `fa-IR`, `de-DE`, `tr-TR`, `ar-SA`, `ru-RU`, `fr-FR`, `es-ES`, `it-IT`, `zh-Hans-CN`, and `ja-JP`; Persian and Arabic are RTL.
- Money never uses binary floating point. API amounts are canonical decimal strings and PostgreSQL uses `numeric(38,12)`; exchange rates use `numeric(38,18)`.
- Operational documents may generate journals but are not themselves the ledger.
- Database constraints, row locks, triggers, RLS, idempotency records, an append-only audit log, and a transactional outbox protect correctness below the HTTP layer.
- Country packs are versioned compliance modules. Translating the UI does not claim legal compliance in any jurisdiction.

Detailed views: [context](docs/architecture/CONTEXT.md), [modules](docs/architecture/MODULES.md), [data](docs/architecture/DATA.md), [tenancy](docs/architecture/TENANCY.md), [accounting](docs/architecture/ACCOUNTING.md), [security](docs/architecture/SECURITY.md), and [integrations](docs/architecture/INTEGRATIONS.md).

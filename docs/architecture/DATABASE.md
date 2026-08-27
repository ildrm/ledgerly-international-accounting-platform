# Database reference

## Schemas and ownership

| Schema | Tables | Purpose |
|---|---|---|
| `iam` | `users`, `sessions` | global identity and revocable sessions |
| `core` | `tenants`, `memberships`, `companies`, `user_localization_preferences` | organization and preference context |
| `ledger` | `books`, `fiscal_periods`, `accounts`, `journals`, `journal_lines`, `number_sequences`, `journal_reversals` | canonical accounting record |
| `audit` | `events` | append-only actor/action evidence |
| `integration` | `outbox_events`, `idempotency_keys` | reliable effects and retries |

The migrator role owns DDL. `ledgerly_runtime` is a login-only `NOBYPASSRLS`, non-owner role with explicit schema/table/sequence grants. Application requests set transaction-local `app.user_id`, `app.tenant_id`, and `app.correlation_id`.

## Numeric and temporal types

- functional/transaction amounts: `numeric(38,12)`;
- exchange rates: `numeric(38,18)`;
- business effective date: `date`;
- events/audit/system time: `timestamptz` in UTC;
- timezone preference: IANA name;
- currency/country: uppercase ISO-style code validated at boundaries and database checks.

## Invariants

Composite tenant FKs prevent cross-tenant references. Journal lines have exactly one positive debit/credit. Posting trigger requires two lines, non-zero equal totals, an open matching period, number, actor and time. Posted journals/lines and audit events reject mutation. RLS is forced on every tenant table.

Migrations are ordered SQL files, checksummed in `public.schema_migrations`, and serialized by advisory lock. Seed IDs and source keys are deterministic so repeat execution is safe.

# Module boundaries

| Module | Owns | Must not own |
|---|---|---|
| Identity | users, credentials, sessions, global preferences | tenant authorization |
| Organization | tenants, memberships, legal entities, branches | journal lines |
| Ledger | books, periods, accounts, journals, sequences, reversals | sales/purchase document workflow |
| Audit | append-only security and business evidence | mutable application state |
| Integration | idempotency, outbox, provider state | ledger truth |
| Localization | locale registry, catalogs, exact presentation/parsing | statutory rules |
| Sales/AP/Inventory/etc. | operational documents and posting commands | direct mutation of posted entries |
| Country packs | sourced, effective-dated jurisdiction policies and outputs | UI language catalogs |

Modules communicate through explicit commands, queries, and domain events. No feature writes directly to another module’s tables except through reviewed same-transaction posting policies inside the modular monolith.

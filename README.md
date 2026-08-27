# Ledgerly

Ledgerly is an international, multi-tenant accounting platform built around an immutable double-entry ledger. The current verified release surface is deliberately narrower than the complete ERP product program: repository and local infrastructure foundations, eleven-language localization, identity and tenant APIs, capability-checked fiscal-period close administration, exact management-report builders, and the accounting-core vertical slice.

The multilingual command-center v1 is deployed privately at [ledgerly-accounting.ildrmsd.chatgpt.site](https://ledgerly-accounting.ildrmsd.chatgpt.site). The active workspace adds a verified web gateway that keeps accounting tokens in a host-only HttpOnly cookie and supports localized sign-in, tenant, company, loading, empty, forbidden, and disconnected states. That gateway update and the production API/data plane are not represented as deployed yet.

## Local development

Prerequisites: Node.js 24, Corepack/pnpm 11, and Docker.

1. Copy `.env.example` to `.env` and keep the development-only values local.
2. Run `docker compose up -d`.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm db:migrate` and `pnpm db:seed`.
5. Run `pnpm dev`.

The web application defaults to `http://localhost:3000`; the API defaults to `http://localhost:4000`; OpenAPI is at `/api/docs`.

Useful checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build`.

Implementation truth is tracked in `docs/agent/FEATURE-MATRIX.md`. A language pack is not a statutory country pack; Iranian regulatory integrations remain separately versioned and externally verified.

The deterministic local seed account is `owner@ledgerly.local` with password `ChangeMe-Accounting-2026!`. It is development-only and must never be enabled in a shared or production environment.

Start with the [optimized product specification](docs/spec/OPTIMIZED-PRODUCT-SPEC.md), [architecture](ARCHITECTURE.md), [API contract](docs/api/README.md), [security policy](SECURITY.md), and [next actions](docs/agent/NEXT-ACTIONS.md).

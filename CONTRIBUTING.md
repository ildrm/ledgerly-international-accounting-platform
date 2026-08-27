# Contributing

## Local prerequisites

Node.js 24, Corepack/pnpm 11.15.1, Docker Desktop/Engine, and Git. Copy `.env.example` to `.env` for local values; never commit it.

```powershell
corepack enable
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:migrate
$env:NODE_ENV = 'development'
$env:LEDGERLY_SEED_PROFILE = 'deterministic-development'
pnpm db:seed
pnpm dev
```

The deterministic local owner is documented in the README and must never be used outside local development.

## Required checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
```

Database integration tests require the local PostgreSQL service and migrated schema. Run migrations twice to verify checksum/idempotent behavior.

## Change rules

- State the affected master-prompt sections in the PR and update `docs/agent/FEATURE-MATRIX.md` only to the status supported by evidence.
- Financial changes require invariant tests for precision, balance, reversal, immutability, periods, idempotency/concurrency, isolation, and reconstruction as applicable.
- Schema changes are forward migrations; never edit an applied migration without an explicit reset procedure and review.
- No UI string belongs inline in a feature component. Add it to every locale and keep catalog parity.
- Verify both RTL locales and at least English plus one long LTR locale for UI changes.
- Never infer statutory behavior. Update the compliance source register and include conformance evidence.
- Do not log or commit secrets, real customer data, bearer tokens, certificates, or production exports.

Use conventional commit intent (`feat`, `fix`, `docs`, `test`, `refactor`, `chore`) and keep changes scoped. Posted-ledger behavior and RLS changes require an accounting/security reviewer.

# Security policy

Do not report sensitive vulnerabilities in a public issue. Send a private report to the repository security contact with affected version/commit, impact, reproduction, and suggested remediation. Until a private contact is configured for this repository, do not deploy it to production or handle real financial/personal data.

## Supported scope

The current code is a pre-1.0 foundation. Security fixes target the active branch only. Regulatory certification, penetration testing, production infrastructure review, and incident-response contacts are not yet complete.

## Secret handling

Never commit credentials, bearer tokens, customer data, production exports, certificates, `.env` files, or provider payloads. Rotate any exposed secret immediately. Use a secret manager in production and ensure authorization/cookie/token/password fields are redacted from logs.

## Baseline expectations

Use least privilege; require TLS; keep the runtime database role non-owner and `NOBYPASSRLS`; validate all input; parameterize SQL; authenticate webhooks; scan dependencies/images/files; protect CI credentials; verify backups; and retain append-only audit evidence. See [the threat model](docs/security/THREAT-MODEL.md).

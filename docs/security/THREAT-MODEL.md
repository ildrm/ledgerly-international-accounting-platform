# Threat model

## Assets

Ledger entries, entity and tenant boundaries, credentials/sessions, personal and payroll data, tax filings, bank/payment data, uploaded documents, signing certificates, audit evidence, backups, and availability at close/filing time.

## Trust boundaries and principal threats

| Boundary | Threats | Current controls | Required production controls |
|---|---|---|---|
| Browser -> API | account takeover, injection, CSRF/XSS, token theft, replay | opaque sessions, validation, headers, CORS, rate limits, redaction | secure same-site delivery design, MFA/passkeys, CSP review, bot/WAF controls |
| Tenant -> tenant | IDOR, query omission, support misuse | membership guard, forced RLS, composite FKs, integration isolation test | recurring RLS audit, support impersonation approval/evidence |
| API -> database | SQL injection, over-privilege, destructive insider | parameterized SQL, non-owner runtime, grants, immutable triggers, audit | managed identity, TLS, network policy, privileged access monitoring |
| API -> provider | spoofing, webhook replay, SSRF, duplicate submission | outbox/idempotency architecture | signed webhooks, egress allowlist, circuit/reconciliation, certificate custody |
| Files | malware, parser exploit, tenant leakage, signed-URL abuse | object-storage separation is scaffolded | quarantine, AV/CDR, content/type/size limits, short URLs, encryption/key policy |
| CI/supply chain | malicious dependency/action, leaked token, artifact tampering | exact versions/lockfile, build-script allowlist | pinned action SHAs, SBOM, provenance/signing, dependency/container scanning |
| Operations | backup theft, ransomware, failed restore, log leakage | local roles and migrations | encrypted immutable backups, cross-account copies, restore drills, SIEM/DLP |

## Abuse cases that must remain tested

- valid outsider presents another tenant ID;
- bookkeeper attempts posting or privileged period action;
- replay/reuse of an idempotency key with changed payload;
- update/delete of a posted journal through the runtime role;
- duplicate source documents and concurrent number allocation;
- malicious bidi controls in financial identifiers;
- forged/replayed provider webhook;
- export or support action without tenant-scoped authorization/audit.

## Residual risks

MFA, file ingestion, workers, support tooling, country-pack submissions, managed infrastructure, backup/restore, security scanning, and independent penetration testing are not delivered. Production use remains blocked until those controls and owners are accepted.

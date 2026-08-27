# Backup and disaster recovery plan

This is the required production runbook contract; it is not yet exercised against a production environment.

## Policy to approve before launch

- Business owner sets RPO/RTO by service and legal retention/deletion obligations.
- PostgreSQL uses encrypted automated snapshots plus point-in-time recovery/WAL in a separate failure domain and account.
- Object storage uses versioning/immutability appropriate to policy and is reconciled with database metadata.
- Secrets, infrastructure definitions, migration artifacts, provider configuration, and signing-certificate custody have separate recovery procedures.
- Backups are least-privilege, monitored, periodically restored into an isolated account, integrity checked, and sampled through financial reconstruction reports.

## Restore exercise

1. Declare incident, preserve audit evidence, identify approved restore point, and freeze conflicting writes.
2. Provision isolated infrastructure from reviewed code; restore database and objects without exposing them to users/providers.
3. Apply only migrations valid for the restore point; verify checksums, counts, tenant isolation, posted-ledger immutability, sequence safety, outbox state, and document/object reconciliation.
4. Reconstruct trial balances and agreed control reports for sampled tenants; obtain finance and security sign-off.
5. Rotate affected secrets/certificates, reconcile external submissions/payments, control DNS/cutover, and monitor.
6. Record actual RPO/RTO, gaps, approvals, and corrective actions.

Launch is blocked until the first full restore drill passes and recurring cadence/owners are recorded.

# Compliance and external-source register

No statutory integration is considered implemented from recollection, translations, competitor behavior, or sample files. Each country/industry pack requires records with the fields below and a second-person review.

| Pack / integration | Authority / provider | Version & effective date | Verification / test evidence | Status |
|---|---|---|---|---|
| Iran taxpayer/e-invoice | authoritative Iranian tax authority specifications required | not supplied | none | BLOCKED_EXTERNAL |
| Iran VAT/statutory books | authoritative law, schemas, signing and filing guidance required | not supplied | none | BLOCKED_EXTERNAL |
| Iran payroll/social insurance | authoritative tax and social-security rules required | not supplied | none | BLOCKED_EXTERNAL |
| Iranian checks/banking | bank/clearing provider protocols and sandbox credentials required | not supplied | none | BLOCKED_EXTERNAL |
| Payment/bank feeds | selected provider contracts, webhooks, sandbox and reconciliation semantics required | not selected | none | BLOCKED_EXTERNAL |
| Email/SMS/storage production | selected provider, residency, retention and DPA requirements | not selected | none | BLOCKED_EXTERNAL |

## International presentation references

These records guide neutral report-engine design only. They do not certify that Ledgerly financial statements comply with IFRS Accounting Standards.

| Subject | Authority / direct source | Version & effective date | Verified at | Implementation status |
|---|---|---|---|---|
| Presentation of financial statements | IFRS Foundation, [IAS 1 overview](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements/) | applicable for 2026 reporting unless IFRS 18 is early-applied | 2026-08-27 | reference verified; statutory presentation not implemented |
| Presentation and disclosure transition | IFRS Foundation, [IFRS 18 issued standard](https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2025/issued/part-a/ifrs-18-presentation-and-disclosure-in-financial-statements.pdf?bypass=on) | mandatory for annual periods beginning on or after 2027-01-01; early application permitted | 2026-08-27 | transition tracked; statutory presentation not implemented |
| Digital financial reporting taxonomy | IFRS Foundation, [2025 Taxonomy remains current for 2026](https://www.ifrs.org/news-and-events/news/2026/02/ifrs-accounting-taxonomy-2025-to-remain-current-for-2026/) | IFRS Accounting Taxonomy 2025 for 2026 reporting | 2026-08-27 | XBRL/tagging not implemented |

Required record fields for every source: jurisdiction, subject, authority, direct URL/document, publication date, effective-from/to, version/checksum, language, reviewer, verified-at, implementation mapping, conformance fixture, credential/certificate owner, superseded-by, and incident/contact route.

The eleven UI language catalogs are not country packs. German UI does not assert German tax compliance; Arabic UI does not select a legal jurisdiction; Persian UI does not activate Iranian filing rules.

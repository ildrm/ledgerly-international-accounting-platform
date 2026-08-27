# Prompt feature traceability matrix

This is the section-by-section source-of-truth for the attached 230-section master prompt (sections 0 through 230). “Verified slice” means the repository contains a tested implementation of the stated concern only for the currently delivered foundation/ledger slice; it never means the entire ERP domain is complete.

Status vocabulary: **VERIFIED_SLICE**, **PARTIAL**, **DESIGNED**, **PLANNED**, **BLOCKED_EXTERNAL**, and **PROCESS**. Regulatory features remain blocked until authoritative, versioned specifications and credentials are supplied. Language support is independent from statutory country-pack certification.

| § | Original requirement | Status | Program phase | Evidence / blocker |
|---:|---|---|---|---|
| 0 | ABSOLUTE EXECUTION DIRECTIVE | PROCESS | Foundation | — |
| 1 | ACT AS ALL OF THESE PROFESSIONAL ROLES | PROCESS | Foundation | — |
| 2 | SKILL AND TOOL USAGE POLICY | PROCESS | Foundation | — |
| 3 | FIRST ACTION: RESEARCH AND VALIDATE THE TECHNICAL BASELINE | PARTIAL | Foundation | `docs/agent`, CI/tests |
| 4 | REQUIRED TECHNOLOGY STACK | VERIFIED_SLICE | Foundation | `package.json`, `turbo.json`, architecture docs |
| 5 | FRONTEND STACK | VERIFIED_SLICE | Foundation | `apps/web`, `packages/localization` |
| 6 | BACKEND STACK | VERIFIED_SLICE | Foundation | `apps/api/src` |
| 7 | DATABASE | VERIFIED_SLICE | Foundation | `packages/database` |
| 8 | ORM / DATABASE ACCESS | VERIFIED_SLICE | Foundation | `packages/database` |
| 9 | CACHE AND JOBS | PARTIAL | Foundation | Redis-backed distributed API throttling is verified; job processing remains planned |
| 10 | OBJECT STORAGE | PARTIAL | Foundation | — |
| 11 | SEARCH | DESIGNED | Foundation | — |
| 12 | ARCHITECTURAL STRATEGY | PARTIAL | Foundation | `package.json`, `turbo.json`, architecture docs |
| 13 | CORE DOMAIN BOUNDARIES | PARTIAL | Foundation | `package.json`, `turbo.json`, architecture docs |
| 14 | ACCOUNTING FOUNDATION — HIGHEST PRIORITY | VERIFIED_SLICE | Ledger core | `packages/accounting`, ledger API/tests |
| 15 | IMMUTABLE POSTED LEDGER | VERIFIED_SLICE | Ledger core | `packages/database` |
| 16 | OPERATIONAL DOCUMENTS ARE NOT THE LEDGER | VERIFIED_SLICE | Ledger core | `packages/accounting`, ledger API/tests |
| 17 | ACCOUNTING ENGINE REQUIREMENTS | VERIFIED_SLICE | Ledger core | `packages/accounting`, ledger API/tests |
| 18 | MONEY MODEL | VERIFIED_SLICE | Ledger core | `packages/accounting`, ledger API/tests |
| 19 | IRR / TOMAN RULE | VERIFIED_SLICE | Ledger core | `packages/accounting`, ledger API/tests |
| 20 | MULTI-CURRENCY | PARTIAL | Ledger core | Exact FX conversion/provenance in `packages/accounting`, migration `0003`, and ledger API integration tests; full revaluation workflows remain planned |
| 21 | MULTI-TENANCY | VERIFIED_SLICE | Ledger core | `packages/database` |
| 22 | ORGANIZATION MANAGEMENT | VERIFIED_SLICE | Ledger core | `TenantService`, integration tests |
| 23 | USER AND IDENTITY SYSTEM | VERIFIED_SLICE | Ledger core | `apps/api/src` |
| 24 | AUTHORIZATION | PARTIAL | Ledger core | `apps/api/src` |
| 25 | SEGREGATION OF DUTIES | DESIGNED | Ledger core | — |
| 26 | SALES AND ACCOUNTS RECEIVABLE | PLANNED | ERP domains | — |
| 27 | CUSTOMER PORTAL | PLANNED | ERP domains | — |
| 28 | PROCUREMENT AND ACCOUNTS PAYABLE | DESIGNED | ERP domains | — |
| 29 | THREE-WAY MATCHING | DESIGNED | ERP domains | — |
| 30 | TREASURY | DESIGNED | ERP domains | — |
| 31 | BANK FEEDS | BLOCKED_EXTERNAL | ERP domains | `docs/compliance/SOURCE-REGISTER.md` |
| 32 | BANK RECONCILIATION | DESIGNED | ERP domains | — |
| 33 | IRANIAN CHECK MANAGEMENT | BLOCKED_EXTERNAL | ERP domains | `docs/compliance/SOURCE-REGISTER.md` |
| 34 | INVENTORY MASTER DATA | DESIGNED | ERP domains | — |
| 35 | WAREHOUSE MANAGEMENT | DESIGNED | ERP domains | — |
| 36 | INVENTORY VALUATION | DESIGNED | ERP domains | — |
| 37 | FIXED ASSETS | DESIGNED | ERP domains | — |
| 38 | HR AND PAYROLL | DESIGNED | ERP domains | — |
| 39 | IRANIAN PAYROLL COMPLIANCE | BLOCKED_EXTERNAL | ERP domains | `docs/compliance/SOURCE-REGISTER.md` |
| 40 | MANUFACTURING | DESIGNED | ERP domains | — |
| 41 | COST ACCOUNTING | DESIGNED | ERP domains | — |
| 42 | PROJECT ACCOUNTING | DESIGNED | ERP domains | — |
| 43 | CONTRACTING / پیمانکاری | BLOCKED_EXTERNAL | ERP domains | `docs/compliance/SOURCE-REGISTER.md` |
| 44 | BUDGETING | DESIGNED | ERP domains | — |
| 45 | FP&A | DESIGNED | ERP domains | — |
| 46 | MULTI-COMPANY | DESIGNED | ERP domains | — |
| 47 | CONSOLIDATION | DESIGNED | ERP domains | — |
| 48 | MULTI-BOOK ACCOUNTING | DESIGNED | ERP domains | — |
| 49 | IRANIAN TAX AND COMPLIANCE ENGINE | BLOCKED_EXTERNAL | ERP domains | `docs/compliance/SOURCE-REGISTER.md` |
| 50 | TAXPAYER / ELECTRONIC INVOICE SYSTEM | BLOCKED_EXTERNAL | ERP domains | `docs/compliance/SOURCE-REGISTER.md` |
| 51 | VAT AND TAX ENGINE | BLOCKED_EXTERNAL | ERP domains | `docs/compliance/SOURCE-REGISTER.md` |
| 52 | ELECTRONIC BOOKS AND STATUTORY OUTPUTS | BLOCKED_EXTERNAL | ERP domains | `docs/compliance/SOURCE-REGISTER.md` |
| 53 | REPORTING ENGINE | PARTIAL | Platform modules | — |
| 54 | REPORT BUILDER | DESIGNED | Platform modules | — |
| 55 | BUSINESS INTELLIGENCE | PLANNED | Platform modules | — |
| 56 | DOCUMENT MANAGEMENT | DESIGNED | Platform modules | — |
| 57 | OCR / DOCUMENT INTELLIGENCE | BLOCKED_EXTERNAL | Platform modules | `docs/compliance/SOURCE-REGISTER.md` |
| 58 | CRM | DESIGNED | Platform modules | — |
| 59 | POS | DESIGNED | Platform modules | — |
| 60 | OFFLINE MODE | PLANNED | Platform modules | — |
| 61 | DISTRIBUTION AND FIELD SALES | DESIGNED | Platform modules | — |
| 62 | E-COMMERCE INTEGRATIONS | BLOCKED_EXTERNAL | Platform modules | `docs/compliance/SOURCE-REGISTER.md` |
| 63 | SUBSCRIPTION BILLING FOR CUSTOMERS | DESIGNED | Platform modules | — |
| 64 | PLATFORM'S OWN SAAS BILLING | DESIGNED | Platform modules | — |
| 65 | ACCOUNTANT PORTAL | DESIGNED | Platform modules | — |
| 66 | WORKFLOW ENGINE | DESIGNED | Platform modules | — |
| 67 | AUTOMATION ENGINE | DESIGNED | Platform modules | — |
| 68 | NOTIFICATIONS | DESIGNED | Platform modules | — |
| 69 | API-FIRST PLATFORM | VERIFIED_SLICE | Platform modules | `apps/api/src` |
| 70 | DEVELOPER PLATFORM | DESIGNED | Platform modules | — |
| 71 | IMPORT / EXPORT | PARTIAL | Platform modules | — |
| 72 | MIGRATION FROM OTHER ACCOUNTING SYSTEMS | DESIGNED | Platform modules | — |
| 73 | LOCALIZATION | VERIFIED_SLICE | Global UX | Eleven catalog-parity tests, runtime switching, locale persistence, and `packages/localization` |
| 74 | DESIGN SYSTEM — MANDATORY | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 75 | TYPOGRAPHY | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 76 | UI PRINCIPLES | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 77 | APPLICATION SHELL | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 78 | COMMAND PALETTE | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 79 | KEYBOARD-FIRST ACCOUNTING UX | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 80 | FINANCIAL DATA TABLE | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 81 | FINANCIAL DOCUMENT EDITOR | DESIGNED | Global UX | — |
| 82 | RESPONSIVE DESIGN | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 83 | RTL/LTR | VERIFIED_SLICE | Global UX | `apps/web`, `packages/localization` |
| 84 | ACCESSIBILITY | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 85 | UI STATES | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 86 | DASHBOARD UX | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 87 | DRILL-DOWN UX | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 88 | PRINTING | PARTIAL | Global UX | `apps/web`, `packages/localization` |
| 89 | AI FINANCIAL ASSISTANT | DESIGNED | Hardening | — |
| 90 | AI SAFETY FOR FINANCIAL OPERATIONS | DESIGNED | Hardening | — |
| 91 | AI FEATURES | DESIGNED | Hardening | — |
| 92 | DATA PRIVACY FOR AI | DESIGNED | Hardening | — |
| 93 | AUDIT LOG | VERIFIED_SLICE | Hardening | `apps/api/src` |
| 94 | SECURITY BASELINE | PARTIAL | Hardening | `apps/api/src` |
| 95 | FILE SECURITY | DESIGNED | Hardening | — |
| 96 | SECRET MANAGEMENT | DESIGNED | Hardening | — |
| 97 | ENCRYPTION | PARTIAL | Hardening | `packages/database` |
| 98 | API SECURITY | VERIFIED_SLICE | Hardening | `apps/api/src` |
| 99 | DATABASE INTEGRITY | VERIFIED_SLICE | Hardening | `packages/database` |
| 100 | IDEMPOTENCY | VERIFIED_SLICE | Hardening | `packages/accounting`, ledger API/tests |
| 101 | TRANSACTIONAL OUTBOX | VERIFIED_SLICE | Hardening | `packages/database` |
| 102 | CONCURRENCY | PARTIAL | Hardening | `packages/accounting`, ledger API/tests |
| 103 | NUMBER SEQUENCES | VERIFIED_SLICE | Hardening | `packages/database` |
| 104 | TIME | VERIFIED_SLICE | Hardening | `packages/accounting`, ledger API/tests |
| 105 | JALALI CALENDAR | VERIFIED_SLICE | Hardening | Reversible Gregorian/Jalali business-date conversion and leap-boundary tests in `packages/localization` |
| 106 | PERFORMANCE OBJECTIVES | PARTIAL | Hardening | — |
| 107 | RESOURCE EFFICIENCY | PARTIAL | Hardening | — |
| 108 | CACHING | PARTIAL | Hardening | — |
| 109 | QUERY PERFORMANCE | PARTIAL | Hardening | — |
| 110 | LARGE LEDGER STRATEGY | DESIGNED | Hardening | — |
| 111 | REPORTING PERFORMANCE | DESIGNED | Hardening | — |
| 112 | BACKGROUND JOBS | DESIGNED | Hardening | — |
| 113 | OBSERVABILITY | PARTIAL | Hardening | — |
| 114 | ERROR HANDLING | VERIFIED_SLICE | Hardening | `apps/api/src` |
| 115 | TESTING STRATEGY | PARTIAL | Hardening | Root lint 5/5 tasks, unit/contract 8/8 tasks, and integration 5/5 tasks; browser/performance/security suites remain incomplete |
| 116 | ACCOUNTING PROPERTY TESTS | PARTIAL | Hardening | `packages/accounting`, ledger API/tests |
| 117 | E2E TESTS | PARTIAL | Hardening | — |
| 118 | VISUAL TESTING | PLANNED | Hardening | — |
| 119 | PERFORMANCE TESTING | PLANNED | Hardening | — |
| 120 | SECURITY TESTING | PLANNED | Hardening | — |
| 121 | BACKUPS | DESIGNED | Operations/docs | — |
| 122 | DISASTER RECOVERY | DESIGNED | Operations/docs | — |
| 123 | CI/CD | PARTIAL | Operations/docs | — |
| 124 | DATABASE MIGRATIONS | VERIFIED_SLICE | Operations/docs | Migrations `0000`-`0003` applied to the active database and a fresh disposable database; static and live invariant tests pass |
| 125 | FEATURE FLAGS | DESIGNED | Operations/docs | — |
| 126 | SUPPORT ADMINISTRATION | DESIGNED | Operations/docs | — |
| 127 | DATA EXPORT AND TENANT PORTABILITY | DESIGNED | Operations/docs | — |
| 128 | ACCOUNTING DATA RETENTION | DESIGNED | Operations/docs | — |
| 129 | ARCHITECTURE DOCUMENTATION | PARTIAL | Operations/docs | `package.json`, `turbo.json`, architecture docs |
| 130 | ARCHITECTURE DECISION RECORDS | DESIGNED | Operations/docs | — |
| 131 | DOMAIN GLOSSARY | DESIGNED | Operations/docs | — |
| 132 | FEATURE TRACEABILITY MATRIX | PARTIAL | Operations/docs | `docs/agent`, CI/tests |
| 133 | UX SPECIFICATION DOCUMENTATION | DESIGNED | Operations/docs | — |
| 134 | API DOCUMENTATION | PARTIAL | Operations/docs | — |
| 135 | DATABASE DOCUMENTATION | PARTIAL | Operations/docs | `packages/database` |
| 136 | THREAT MODEL | PARTIAL | Operations/docs | — |
| 137 | COMPLIANCE MATRIX | DESIGNED | Operations/docs | — |
| 138 | IMPLEMENTATION PHASES | DESIGNED | Operations/docs | — |
| 139 | MANDATORY EXECUTION LOOP FOR EVERY FEATURE | PROCESS | Expansion | — |
| 140 | TRIPLE REVIEW GATE | PROCESS | Expansion | — |
| 141 | NO PLACEHOLDER RULE | PROCESS | Expansion | — |
| 142 | NO FAKE SUCCESS RULE | PROCESS | Expansion | — |
| 143 | BUG POLICY | PROCESS | Expansion | — |
| 144 | CODE QUALITY | PARTIAL | Expansion | `package.json`, `turbo.json`, architecture docs |
| 145 | DOMAIN MODELING | PARTIAL | Expansion | `package.json`, `turbo.json`, architecture docs |
| 146 | DOMAIN EVENTS | PARTIAL | Expansion | — |
| 147 | FINANCIAL POSTING POLICIES | PARTIAL | Expansion | `packages/accounting`, ledger API/tests |
| 148 | CONTROL ACCOUNT RECONCILIATION | DESIGNED | Expansion | — |
| 149 | PERIOD CLOSE | DESIGNED | Expansion | — |
| 150 | FINANCIAL AUDITABILITY | PARTIAL | Expansion | `packages/database` |
| 151 | SEARCH UX | DESIGNED | Expansion | — |
| 152 | AUDITABLE EXPORTS | DESIGNED | Expansion | — |
| 153 | INTERNATIONALIZATION QUALITY | PARTIAL | Expansion | `apps/web`, `packages/localization` |
| 154 | ERROR COPY | PARTIAL | Expansion | `apps/api/src` |
| 155 | ONBOARDING | PARTIAL | Expansion | `TenantService`, integration tests |
| 156 | COUNTRY / INDUSTRY PACK ARCHITECTURE | DESIGNED | Expansion | — |
| 157 | CONFIGURABILITY | DESIGNED | Expansion | — |
| 158 | CUSTOM FIELDS | DESIGNED | Expansion | — |
| 159 | DATA MIGRATION SAFETY | DESIGNED | Expansion | — |
| 160 | FINANCIAL EXCEL EXPORT | DESIGNED | Expansion | — |
| 161 | PDF REPORTING | DESIGNED | Expansion | — |
| 162 | OPTIONAL INTEGRATION ABSTRACTIONS | DESIGNED | Expansion | — |
| 163 | DEPENDENCY POLICY | PARTIAL | Expansion | — |
| 164 | FRONTEND PERFORMANCE POLICY | PARTIAL | Expansion | `apps/web`, `packages/localization` |
| 165 | UX PERFORMANCE | PARTIAL | Expansion | `apps/web`, `packages/localization` |
| 166 | FINANCIAL CONFIRMATIONS | DESIGNED | Expansion | — |
| 167 | ACTIVITY TIMELINE | DESIGNED | Expansion | — |
| 168 | COMMENTS AND COLLABORATION | DESIGNED | Expansion | — |
| 169 | APPROVAL CENTER | DESIGNED | Expansion | — |
| 170 | FINANCIAL COMMAND CENTER | PARTIAL | Expansion | `apps/web`, `packages/localization` |
| 171 | AI INSIGHT CARDS | DESIGNED | Expansion | — |
| 172 | DO NOT CREATE PSEUDOSCIENTIFIC FINANCE | DESIGNED | Expansion | — |
| 173 | USER HELP | DESIGNED | Expansion | — |
| 174 | SAMPLE DATA | DESIGNED | Expansion | — |
| 175 | DEVELOPER EXPERIENCE | PARTIAL | Expansion | `package.json`, `turbo.json`, architecture docs |
| 176 | LOCAL ENVIRONMENT | VERIFIED_SLICE | Expansion | `package.json`, `turbo.json`, architecture docs |
| 177 | PRODUCTION CONFIGURATION | PARTIAL | Expansion | — |
| 178 | HEALTH CHECKS | VERIFIED_SLICE | Expansion | `apps/api/src` |
| 179 | RATE LIMITING | VERIFIED_SLICE | Expansion | Atomic Redis-backed distributed IP/account throttling and cross-replica integration coverage in `apps/api/src` |
| 180 | DATABASE CONNECTION MANAGEMENT | VERIFIED_SLICE | Expansion | `apps/api/src` |
| 181 | BACKGROUND RETRIES | DESIGNED | Expansion | — |
| 182 | EXTERNAL SERVICE CIRCUIT BREAKING | DESIGNED | Expansion | — |
| 183 | FEATURE COMPLETENESS AUDIT | PARTIAL | Expansion | `docs/agent`, CI/tests |
| 184 | FINAL FINANCIAL AUDIT | PROCESS | Acceptance | — |
| 185 | FINAL SECURITY AUDIT | PROCESS | Acceptance | — |
| 186 | FINAL UX AUDIT | PROCESS | Acceptance | — |
| 187 | FINAL PERFORMANCE AUDIT | PROCESS | Acceptance | — |
| 188 | FINAL DOCUMENTATION | PROCESS | Acceptance | — |
| 189 | DEFINITION OF DONE — FEATURE | PROCESS | Acceptance | — |
| 190 | DEFINITION OF DONE — MODULE | PROCESS | Acceptance | — |
| 191 | DEFINITION OF DONE — PLATFORM | PROCESS | Acceptance | — |
| 192 | QUESTIONS POLICY | PROCESS | Acceptance | — |
| 193 | SOURCE OF TRUTH PRIORITY | DESIGNED | Acceptance | — |
| 194 | NO BLIND COMPETITOR COPYING | DESIGNED | Acceptance | — |
| 195 | PRODUCT EXPERIENCE TARGET | DESIGNED | Acceptance | — |
| 196 | STARTING UX INFORMATION ARCHITECTURE | PARTIAL | Acceptance | `apps/web`, `packages/localization` |
| 197 | ACCOUNTING SCREEN UX | PARTIAL | Acceptance | `apps/web`, `packages/localization` |
| 198 | ERROR PREVENTION | PARTIAL | Acceptance | `apps/web`, `packages/localization` |
| 199 | FINANCIAL CONSISTENCY CHECKS | PARTIAL | Acceptance | `packages/accounting`, ledger API/tests |
| 200 | DATABASE RECONSTRUCTION PRINCIPLE | VERIFIED_SLICE | Acceptance | `packages/database` |
| 201 | EXPLAINABILITY | PARTIAL | Acceptance | — |
| 202 | PRIVACY | DESIGNED | Acceptance | — |
| 203 | DATA CHANGE POLICIES | DESIGNED | Acceptance | — |
| 204 | EVENT EFFECTIVE DATES | DESIGNED | Acceptance | — |
| 205 | CLOSING ASSISTANT | DESIGNED | Acceptance | — |
| 206 | RECONCILIATION-FIRST DESIGN | DESIGNED | Acceptance | — |
| 207 | CUSTOMIZATION SAFETY | DESIGNED | Acceptance | — |
| 208 | BUSINESS CONTINUITY | DESIGNED | Acceptance | — |
| 209 | OBSERVABLE COMPLIANCE SUBMISSION | BLOCKED_EXTERNAL | Acceptance | `docs/compliance/SOURCE-REGISTER.md` |
| 210 | REPORT PROVENANCE | VERIFIED_SLICE | Acceptance | `packages/database` |
| 211 | DESIGN FOR ACCOUNTING FIRMS | DESIGNED | Acceptance | — |
| 212 | MOBILE PRIORITY | DESIGNED | Acceptance | — |
| 213 | NOTIFICATION FATIGUE | DESIGNED | Acceptance | — |
| 214 | ACCOUNTING TEMPLATES | DESIGNED | Acceptance | — |
| 215 | OPENING BALANCE WORKFLOW | DESIGNED | Acceptance | — |
| 216 | DUPLICATE PREVENTION | DESIGNED | Acceptance | — |
| 217 | FRAUD-RESISTANT WORKFLOWS | DESIGNED | Acceptance | — |
| 218 | QUALITY GATES | PARTIAL | Acceptance | `docs/agent`, CI/tests |
| 219 | CODE REVIEW CHECKLIST | PARTIAL | Acceptance | `docs/agent`, CI/tests |
| 220 | PROHIBITED SHORTCUTS | PROCESS | Acceptance | — |
| 221 | ACCEPTANCE TEST — SALES | PLANNED | Acceptance | — |
| 222 | ACCEPTANCE TEST — PURCHASE | PLANNED | Acceptance | — |
| 223 | ACCEPTANCE TEST — INVENTORY | PLANNED | Acceptance | — |
| 224 | ACCEPTANCE TEST — MULTI-CURRENCY | PARTIAL | Acceptance | Foreign EUR-to-USD rate provenance and journal posting are covered by API integration tests; broader revaluation scenarios remain planned |
| 225 | ACCEPTANCE TEST — PERIOD LOCK | PARTIAL | Acceptance | `packages/accounting`, ledger API/tests |
| 226 | ACCEPTANCE TEST — MULTI-TENANCY | VERIFIED_SLICE | Acceptance | `packages/database` |
| 227 | ACCEPTANCE TEST — RTL | VERIFIED_SLICE | Acceptance | `apps/web`, `packages/localization` |
| 228 | DATABASE SEED | VERIFIED_SLICE | Acceptance | `packages/database` |
| 229 | REPOSITORY RULES | VERIFIED_SLICE | Acceptance | `package.json`, `turbo.json`, architecture docs |
| 230 | FINAL EXECUTION COMMAND | PROCESS | Acceptance | — |

## Delivery truth

The runnable foundation presently covers identity, sessions, user localization preferences, tenant isolation, legal-entity onboarding, a statutory book and fiscal period, chart of accounts, journal drafts, atomic posting, exact reversal, immutable posted entries, sourced historical FX provenance, Redis-backed distributed throttling, audit/outbox records, idempotency, and a reconstructed trial balance. The broader sales, purchasing, inventory, payroll, tax, manufacturing, CRM, POS, AI, country-pack, and integration programs remain explicit backlog—not simulated success.

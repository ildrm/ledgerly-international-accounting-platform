# System context

Ledgerly serves business owners, bookkeepers, accountants, controllers, auditors, employees, customers, suppliers, support operators, and integration developers. The trusted financial boundary is the API plus PostgreSQL; browsers and external providers are untrusted inputs.

Inbound channels are the web app, future mobile/offline clients, imports, webhooks, and provider feeds. Outbound channels are reports/exports, notifications, object storage, filing providers, banks, payments, and webhooks. All outbound financial side effects must originate from a committed outbox record and retain correlation/provenance.

The platform is initially a modular monolith because ledger, authorization, audit, numbering, and posting require strong local transactions. Modules may be extracted only when their consistency boundary and operating cost justify it.

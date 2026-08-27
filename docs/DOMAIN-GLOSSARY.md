# Domain glossary

| Term | Meaning |
|---|---|
| Tenant / workspace | Security and commercial boundary containing memberships and legal entities. |
| Legal entity / company | Statutory reporting organization with country, functional currency, and timezone. |
| Membership | A user’s role and status inside a tenant. |
| Book | Independent statutory/management/tax/IFRS accounting view for one entity. |
| Fiscal period | Business-date range with open, soft-closed, or hard-closed state. |
| Account | Chart-of-accounts node with type, normal balance, and posting permission. |
| Journal | Header grouping a balanced set of debit and credit lines. |
| Draft / posted | Editable operational accounting command versus immutable financial record. |
| Reversal | New linked journal that exactly negates an earlier posted journal. |
| Functional currency | Currency in which a book balances and reports. |
| Transaction currency | Original economic-document currency retained on a line. |
| Exchange rate | Exact conversion factor plus future source/effective-date policy. |
| Business date | Canonical Gregorian date on which an accounting event is effective. |
| Event time | UTC instant at which the system recorded an action. |
| Control account | General-ledger account expected to reconcile to a subledger. |
| Posting policy | Versioned rules translating an operational document into journal commands. |
| Idempotency key | Client operation key preventing duplicate financial effects on retries. |
| Transactional outbox | Events committed with business data for reliable asynchronous delivery. |
| Audit event | Append-only evidence of actor, action, target, correlation, time, and safe metadata. |
| UI locale | Language/catalog/direction used by the interface. |
| Formatting locale | Regional presentation convention, independent from UI language. |
| Calendar | Gregorian or Persian presentation/input system; storage remains canonical. |
| Numbering system | Latin, Arabic-Indic, or extended Arabic-Indic presentation/input digits. |
| Country pack | Versioned sourced statutory logic; never synonymous with a language pack. |

# Accounting architecture

The general ledger is the authoritative accounting record. Operational modules produce reviewed journal commands through versioned posting policies. A transaction validates accounts, period, currency, balance, source uniqueness, role, and idempotency; locks the sequence and journal; posts; appends audit evidence; and writes an outbox event atomically.

Posted rows cannot be edited or deleted. Reversals copy every original line with debit/credit swapped and transaction amount negated, link both journals, allocate a new number, and retain reason/actor/time. Trial balance and later statements reconstruct exclusively from posted lines and include tenant, entity, book, period, and generation provenance.

The pure `@ledgerly/accounting` package provides exact `Decimal`, currency-aware `Money`, canonical business dates, fiscal-period rules, immutable posting/reversal, idempotent replay, and trial balance invariants independently of HTTP and PostgreSQL.

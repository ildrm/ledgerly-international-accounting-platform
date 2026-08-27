# ADR 0006: Separate language, formatting, calendar, digits, timezone, currency, and jurisdiction

- Status: Accepted
- Date: 2026-08-26

## Decision

Persist independent globalization preferences and treat country packs as separate compliance modules. Use canonical BCP 47 UI locales and IANA/Unicode identifiers.

## Consequences

RTL is driven by UI language while numeric/date presentation follows the format context. A translation release makes no statutory claim. Catalog parity, bidi safety, localized parsing, and cross-combination tests are required.

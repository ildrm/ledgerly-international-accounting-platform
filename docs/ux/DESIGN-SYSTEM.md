# Product and design-system contract

Ledgerly’s command center is dense enough for accounting work but calm, explicit, and keyboard-friendly. Design tokens use logical CSS properties so direction can switch without mirrored one-off overrides.

## Foundations

- Type: readable multilingual system stack; tabular numerals for finance; no font may omit Persian, Arabic, Cyrillic, Han, or Japanese glyphs.
- Color: neutral ink/surfaces with semantic success/warning/error/info tokens; no state relies on color alone.
- Spacing: 4px base rhythm, touch targets at least 44 CSS px, visible focus ring, consistent density modes.
- Numbers: value and currency remain a bidi-isolated unit; precision is never hidden without an explicit presentation-rounding policy.
- Motion: functional and restrained, disabled under `prefers-reduced-motion`.

## Components and states

Every control defines default, hover, focus-visible, active, disabled, loading, validation-error, permission-denied, empty, and offline/degraded states. Financial tables require sticky identifiers/totals, keyboard traversal, column meaning in accessible names, server-side pagination/filter provenance, export parity, and no horizontal loss on narrow screens.

Destructive or final finance actions summarize entity/book/period/date/amount/effect and require explicit confirmation. Successful commands show the durable document/journal identifier; ambiguous provider timeouts show reconciliation state, never fake success.

## Navigation

The shell groups Home, Sales, Purchasing, Treasury, Inventory, Accounting, Payroll, Reports, and Tax & compliance. Feature visibility is permission-aware but authorization remains server-side. Command-palette and shortcuts must not override platform/accessibility conventions and must be localized.

# ADR 0004: Posted journals are immutable

- Status: Accepted
- Date: 2026-08-26

## Decision

Forbid update/delete of posted journals and lines at the database layer. Correct errors with linked equal-and-opposite journals.

## Consequences

Audit history remains reconstructible. Reversal permissions, dates, periods, reasons, and duplicate prevention are first-class. Operational documents may change only according to their own workflow and must never rewrite posted history.

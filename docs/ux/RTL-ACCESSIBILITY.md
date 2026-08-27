# RTL and accessibility verification

Target WCAG 2.2 AA. Persian and Arabic are first-class layouts, not translated LTR screenshots.

## Direction rules

- Set document `lang` and `dir` from the active UI locale at runtime.
- Use logical properties (`inline-start`, `margin-inline`, etc.) and reverse directional icons only when their semantics are directional.
- Keep account codes, emails, document numbers, IBANs, currencies, and mixed-script values in bidi isolation; reject invisible controls in identifiers.
- Financial columns preserve semantic debit/credit order according to the product decision, with headings always visible; do not rely on visual mirroring to change accounting meaning.

## Required checks

- keyboard-only operation, focus order/visibility, skip/navigation names and escape behavior;
- screen-reader labels, live regions, error association, table semantics and dialog focus trapping;
- 200% zoom/reflow, narrow mobile, German/Russian expansion, Persian/Arabic wrapping, CJK line breaking;
- contrast, high-contrast/forced colors, reduced motion, touch targets, pointer alternatives;
- empty/loading/error/forbidden/degraded states and no fake financial data;
- print/PDF direction, page headers, repeated table headings, totals, provenance, and no clipped values.

Automated lint/axe checks are necessary but not sufficient. Browser and assistive-technology evidence must be recorded before the UI matrix rows become fully verified.

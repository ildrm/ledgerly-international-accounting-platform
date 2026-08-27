import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AccountingError,
  Currency,
  JournalLedger,
  Money,
  type PostJournalCommand,
} from "../dist/index.js";

const usd = new Currency("USD", 2);

function errorCode(expected: string): (error: unknown) => boolean {
  return (error) => error instanceof AccountingError && error.code === expected;
}

function ledger(status: "open" | "soft-closed" | "hard-closed" = "open"): JournalLedger {
  let sequence = 0;
  return new JournalLedger({
    tenantId: "tenant-a",
    companyId: "company-a",
    bookId: "book-a",
    baseCurrency: usd,
    periods: [{ id: "2026", startDate: "2026-01-01", endDate: "2026-12-31", status }],
    idGenerator: () => `id-${++sequence}`,
    clock: () => new Date("2026-08-26T00:00:00.000Z"),
  });
}

function sale(sourceId = "invoice-1"): PostJournalCommand {
  return {
    businessDate: "2026-08-26",
    source: { type: "sales-invoice", id: sourceId },
    description: "Invoice",
    lines: [
      { accountId: "accounts-receivable", debit: Money.exact("109.00", usd) },
      { accountId: "sales", credit: Money.exact("100.00", usd) },
      { accountId: "output-tax", credit: Money.exact("9.00", usd) },
    ],
  };
}

describe("immutable journal ledger", () => {
  it("posts only balanced double-entry commands", () => {
    const journal = ledger().post(sale(), { idempotencyKey: "post-1", actorId: "owner" });
    assert.equal(journal.status, "posted");
    assert.equal(journal.totalDebit.toString(), "109.00 USD");
    assert.equal(journal.totalCredit.toString(), "109.00 USD");
    assert.ok(Object.isFrozen(journal));
    assert.ok(Object.isFrozen(journal.lines));

    const invalid = sale("invoice-2");
    const unbalanced = { ...invalid, lines: invalid.lines.slice(0, 2) };
    assert.throws(
      () => ledger().post(unbalanced, { idempotencyKey: "post-2", actorId: "owner" }),
      errorCode("UNBALANCED_JOURNAL"),
    );
  });

  it("replays identical idempotent commands and rejects key reuse", () => {
    const book = ledger();
    const first = book.post(sale(), { idempotencyKey: "post-1", actorId: "owner" });
    const replay = book.post(sale(), { idempotencyKey: "post-1", actorId: "owner" });
    assert.strictEqual(replay, first);
    assert.throws(
      () => book.post(sale("invoice-2"), { idempotencyKey: "post-1", actorId: "owner" }),
      errorCode("IDEMPOTENCY_CONFLICT"),
    );
  });

  it("creates an exact reversal and leaves a zero ending balance", () => {
    const book = ledger();
    const original = book.post(sale(), { idempotencyKey: "post-1", actorId: "owner" });
    const reversal = book.reverse(
      { journalId: original.id, businessDate: "2026-08-27", description: "Void invoice" },
      { idempotencyKey: "reverse-1", actorId: "owner" },
    );
    assert.equal(reversal.reversalOfJournalId, original.id);
    assert.equal(reversal.lines[0]?.credit?.toString(), "109.00 USD");
    assert.equal(reversal.lines[1]?.debit?.toString(), "100.00 USD");
    assert.equal(book.trialBalance({ from: "2026-01-01", to: "2026-12-31" }).totals.endingDebit.toString(), "0.00 USD");
    assert.throws(
      () => book.reverse(
        { journalId: original.id, businessDate: "2026-08-28" },
        { idempotencyKey: "reverse-2", actorId: "owner" },
      ),
      errorCode("ALREADY_REVERSED"),
    );
  });

  it("requires documented soft-close overrides and forbids hard-close posting", () => {
    const soft = ledger("soft-closed");
    assert.throws(
      () => soft.post(sale(), { idempotencyKey: "post-1", actorId: "owner" }),
      errorCode("SOFT_CLOSE_OVERRIDE_REQUIRED"),
    );
    const posted = soft.post(sale(), {
      idempotencyKey: "post-2",
      actorId: "controller",
      softCloseOverride: { reason: "Approved late tax adjustment" },
    });
    assert.equal(posted.softCloseOverrideReason, "Approved late tax adjustment");

    assert.throws(
      () => ledger("hard-closed").post(sale(), { idempotencyKey: "post-3", actorId: "owner" }),
      errorCode("PERIOD_LOCKED"),
    );
  });

  it("builds a balanced trial balance from posted journals only", () => {
    const book = ledger();
    book.post(sale(), { idempotencyKey: "post-1", actorId: "owner" });
    const report = book.trialBalance({ from: "2026-08-01", to: "2026-08-31" });
    assert.equal(report.rows.length, 3);
    assert.equal(report.totals.periodDebit.toString(), "109.00 USD");
    assert.equal(report.totals.periodCredit.toString(), "109.00 USD");
    assert.ok(report.totals.endingDebit.equals(report.totals.endingCredit));
  });

  it("does not reserve staged identifiers when a commit fails", () => {
    const identifiers = [
      "journal-1", "line-1", "line-1",
      "journal-1", "line-1", "line-2", "line-3",
    ];
    const book = new JournalLedger({
      tenantId: "tenant-a",
      companyId: "company-a",
      bookId: "book-a",
      baseCurrency: usd,
      periods: [{ id: "2026", startDate: "2026-01-01", endDate: "2026-12-31" }],
      idGenerator: () => identifiers.shift() ?? "unexpected-id",
      clock: () => new Date("2026-08-26T00:00:00.000Z"),
    });

    assert.throws(
      () => book.post(sale(), { idempotencyKey: "post-1", actorId: "owner" }),
      errorCode("DUPLICATE_IDENTIFIER"),
    );
    const posted = book.post(sale(), { idempotencyKey: "post-1", actorId: "owner" });
    assert.equal(posted.id, "journal-1");
    assert.deepEqual(posted.lines.map((line) => line.id), ["line-1", "line-2", "line-3"]);
  });

  it("requires and audits an explicit capability when reopening a hard-closed period", () => {
    const book = ledger();
    book.closePeriod("2026", "hard-closed", {
      actorId: "controller",
      reason: "Year-end close approved",
    });
    assert.throws(
      () => book.reopenPeriod("2026", { actorId: "accountant", reason: "Late adjustment" }),
      errorCode("PERIOD_REOPEN_NOT_AUTHORIZED"),
    );

    const reopened = book.reopenPeriod("2026", {
      actorId: "accountant",
      reason: "Late adjustment approved",
      hardCloseReopenAuthorization: {
        capability: "period.reopen.hard-closed",
        grantId: "approval-2026-001",
        authorizedBy: "chief-controller",
      },
    });
    assert.equal(reopened.status, "open");
    const audit = book.listPeriodStatusChanges().at(-1);
    assert.equal(audit?.authorizationGrantId, "approval-2026-001");
    assert.equal(audit?.authorizedBy, "chief-controller");
  });
});

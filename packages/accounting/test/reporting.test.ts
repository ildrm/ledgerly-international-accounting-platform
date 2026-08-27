import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AccountingError,
  Currency,
  FinancialReportBuilder,
  JournalLedger,
  Money,
  type JournalLineInput,
  type ReportingAccountInput,
} from "../dist/index.js";

const usd = new Currency("USD", 2);

const accounts: readonly ReportingAccountInput[] = [
  { id: "cash", code: "1000", name: "Cash", classification: "asset" },
  { id: "equipment", code: "1100", name: "Equipment", classification: "asset" },
  {
    id: "accumulated-depreciation",
    code: "1190",
    name: "Accumulated depreciation",
    classification: "asset",
    isContra: true,
  },
  { id: "accounts-payable", code: "2000", name: "Accounts payable", classification: "liability" },
  {
    id: "retained-earnings",
    code: "3000",
    name: "Retained earnings",
    classification: "equity",
    role: "retained-earnings",
  },
  { id: "capital", code: "3100", name: "Contributed capital", classification: "equity" },
  { id: "sales", code: "4000", name: "Sales", classification: "revenue" },
  {
    id: "sales-returns",
    code: "4090",
    name: "Sales returns",
    classification: "revenue",
    isContra: true,
  },
  { id: "rent", code: "5000", name: "Rent", classification: "expense" },
  { id: "depreciation", code: "5100", name: "Depreciation", classification: "expense" },
  { id: "unused-expense", code: "9999", name: "Unused expense", classification: "expense" },
];

function errorCode(expected: string): (error: unknown) => boolean {
  return (error) => error instanceof AccountingError && error.code === expected;
}

function ledger(): JournalLedger {
  let sequence = 0;
  return new JournalLedger({
    tenantId: "tenant-a",
    companyId: "company-a",
    bookId: "book-a",
    baseCurrency: usd,
    periods: [
      { id: "2025", startDate: "2025-01-01", endDate: "2025-12-31" },
      { id: "2026", startDate: "2026-01-01", endDate: "2026-12-31" },
    ],
    idGenerator: () => `id-${String(++sequence).padStart(4, "0")}`,
    clock: () => new Date("2026-08-27T09:30:00.000Z"),
  });
}

function builder(book: JournalLedger, definitions = accounts): FinancialReportBuilder {
  return new FinancialReportBuilder({
    ledger: book,
    accounts: definitions,
    policy: {
      id: "internal-management",
      version: "2026.1",
      name: "Internal management statements",
    },
    clock: () => new Date("2026-08-27T10:00:00.000Z"),
  });
}

function post(
  book: JournalLedger,
  sourceId: string,
  businessDate: string,
  lines: readonly JournalLineInput[],
  sourceType = "manual-journal",
): void {
  book.post(
    {
      businessDate,
      source: { type: sourceType, id: sourceId },
      description: `Posting ${sourceId}`,
      lines,
    },
    { idempotencyKey: `post-${sourceId}`, actorId: "accountant-a" },
  );
}

describe("auditable financial reporting", () => {
  it("builds deterministic general-ledger detail with opening and running balances", () => {
    const book = ledger();
    post(book, "capital-1", "2025-12-31", [
      { accountId: "cash", debit: Money.exact("200.00", usd), description: "Opening cash" },
      { accountId: "capital", credit: Money.exact("200.00", usd) },
    ]);
    post(book, "sale-1", "2026-01-05", [
      {
        accountId: "cash",
        debit: Money.exact("100.00", usd),
        dimensions: { region: "EU" },
      },
      {
        accountId: "sales",
        credit: Money.exact("100.00", usd),
        dimensions: { region: "EU" },
      },
    ], "sales-invoice");
    post(book, "rent-1", "2026-01-10", [
      { accountId: "rent", debit: Money.exact("20.00", usd) },
      { accountId: "cash", credit: Money.exact("20.00", usd) },
    ]);

    const reporting = builder(book);
    const cash = reporting.generalLedger({
      from: "2026-01-01",
      to: "2026-01-31",
      accountIds: ["cash"],
    });
    assert.equal(cash.accounts.length, 1);
    assert.equal(cash.accounts[0]?.openingBalance.debit.toString(), "200.00 USD");
    assert.equal(cash.accounts[0]?.entries[0]?.runningBalance.debit.toString(), "300.00 USD");
    assert.equal(cash.accounts[0]?.entries[1]?.runningBalance.debit.toString(), "280.00 USD");
    assert.equal(cash.accounts[0]?.periodDebit.toString(), "100.00 USD");
    assert.equal(cash.accounts[0]?.periodCredit.toString(), "20.00 USD");
    assert.equal(cash.accounts[0]?.endingBalance.naturalAmount.toString(), "280.00 USD");
    assert.equal(cash.selectionBalanced, false);
    assert.equal(cash.provenance.sourceJournalCount, 3);
    assert.equal(cash.provenance.sourceLineCount, 3);
    assert.equal(cash.accounts[0]?.entries[0]?.source.type, "sales-invoice");
    assert.equal(cash.accounts[0]?.entries[0]?.postedBy, "accountant-a");
    assert.equal(cash.accounts[0]?.entries[0]?.postedAt, "2026-08-27T09:30:00.000Z");
    assert.ok(Object.isFrozen(cash));
    assert.ok(Object.isFrozen(cash.accounts[0]?.entries));

    const complete = reporting.generalLedger({
      from: "2026-01-01",
      to: "2026-01-31",
      includeZeroBalances: true,
    });
    assert.equal(complete.accounts[0]?.account.code, "1000");
    assert.equal(complete.accounts.at(-1)?.account.code, "9999");
    assert.equal(complete.selectionBalanced, true);
    assert.equal(complete.totals.openingDebit.toString(), "200.00 USD");
    assert.equal(complete.totals.openingCredit.toString(), "200.00 USD");
    assert.equal(complete.totals.periodDebit.toString(), "120.00 USD");
    assert.equal(complete.totals.periodCredit.toString(), "120.00 USD");

    const eu = reporting.generalLedger({
      from: "2026-01-01",
      to: "2026-01-31",
      filters: { dimensions: { region: "EU" } },
    });
    assert.deepEqual(eu.accounts.map((row) => row.account.id), ["cash", "sales"]);
    assert.equal(eu.selectionBalanced, true);
  });

  it("builds an exact comparative income statement and presents contra revenue negatively", () => {
    const book = ledger();
    post(book, "prior-sale", "2025-06-01", [
      { accountId: "cash", debit: Money.exact("50.03", usd) },
      { accountId: "sales", credit: Money.exact("50.03", usd) },
    ], "sales-invoice");
    post(book, "current-sale", "2026-06-01", [
      { accountId: "cash", debit: Money.exact("100.01", usd) },
      { accountId: "sales", credit: Money.exact("100.01", usd) },
    ], "sales-invoice");
    post(book, "return", "2026-06-02", [
      { accountId: "sales-returns", debit: Money.exact("0.01", usd) },
      { accountId: "cash", credit: Money.exact("0.01", usd) },
    ], "credit-note");
    post(book, "rent", "2026-06-03", [
      { accountId: "rent", debit: Money.exact("20.00", usd) },
      { accountId: "cash", credit: Money.exact("20.00", usd) },
    ]);

    const report = builder(book).incomeStatement({
      from: "2026-01-01",
      to: "2026-12-31",
      comparison: { label: "Previous year", from: "2025-01-01", to: "2025-12-31" },
      includeZeroBalances: true,
    });
    assert.equal(report.totals.current.revenue.toString(), "100.00 USD");
    assert.equal(report.totals.current.expense.toString(), "20.00 USD");
    assert.equal(report.totals.current.netIncome.toString(), "80.00 USD");
    assert.equal(report.totals.comparison?.revenue.toString(), "50.03 USD");
    assert.equal(report.totals.comparison?.netIncome.toString(), "50.03 USD");
    const returns = report.revenue.find((row) => row.account.id === "sales-returns");
    assert.equal(returns?.account.normalBalance, "debit");
    assert.equal(returns?.amount.current.toString(), "-0.01 USD");
    assert.match(returns?.trace.current[0]?.lineId ?? "", /^id-\d{4}$/);
    assert.equal(returns?.trace.current[0]?.source.id, "return");
    assert.equal(
      report.expenses.find((row) => row.account.id === "unused-expense")?.amount.current.toString(),
      "0.00 USD",
    );
    assert.equal(report.provenance.policy.purpose, "management-reporting");
    assert.equal(report.provenance.policy.statutoryFrameworkAssertion, null);
    assert.equal(report.provenance.generatedAt, "2026-08-27T10:00:00.000Z");
    assert.deepEqual(
      report.provenance.sourceJournals.map((journal) => journal.source.id),
      ["prior-sale", "current-sale", "return", "rent"],
    );
  });

  it("builds comparative balance sheets with contra assets and an exact accounting equation", () => {
    const book = ledger();
    post(book, "prior-sale", "2025-06-01", [
      { accountId: "cash", debit: Money.exact("50.00", usd) },
      { accountId: "sales", credit: Money.exact("50.00", usd) },
    ]);
    post(book, "sale", "2026-06-01", [
      { accountId: "cash", debit: Money.exact("100.00", usd) },
      { accountId: "sales", credit: Money.exact("100.00", usd) },
    ]);
    post(book, "return", "2026-06-02", [
      { accountId: "sales-returns", debit: Money.exact("5.00", usd) },
      { accountId: "cash", credit: Money.exact("5.00", usd) },
    ]);
    post(book, "rent", "2026-06-03", [
      { accountId: "rent", debit: Money.exact("20.00", usd) },
      { accountId: "cash", credit: Money.exact("20.00", usd) },
    ]);
    post(book, "equipment", "2026-06-04", [
      { accountId: "equipment", debit: Money.exact("100.00", usd) },
      { accountId: "accounts-payable", credit: Money.exact("100.00", usd) },
    ]);
    post(book, "depreciation", "2026-06-05", [
      { accountId: "depreciation", debit: Money.exact("10.00", usd) },
      { accountId: "accumulated-depreciation", credit: Money.exact("10.00", usd) },
    ]);

    const report = builder(book).balanceSheet({
      asOf: "2026-12-31",
      comparisonAsOf: "2025-12-31",
      includeZeroBalances: true,
    });
    const accumulated = report.assets.find((row) => row.account.id === "accumulated-depreciation");
    assert.equal(accumulated?.account.normalBalance, "credit");
    assert.equal(accumulated?.amount.current.toString(), "-10.00 USD");
    assert.equal(report.totals.current.assets.toString(), "215.00 USD");
    assert.equal(report.totals.current.liabilities.toString(), "100.00 USD");
    assert.equal(report.totals.current.unclosedEarnings.toString(), "115.00 USD");
    assert.equal(report.totals.current.liabilitiesAndEquity.toString(), "215.00 USD");
    assert.equal(report.totals.comparison?.assets.toString(), "50.00 USD");
    assert.equal(report.totals.comparison?.unclosedEarnings.toString(), "50.00 USD");
    assert.equal(report.retainedEarningsAccountId, "retained-earnings");
    assert.equal(report.unclosedEarningsTrace.current.length, 5);
    assert.equal(report.provenance.sourceJournalCount, 6);
    assert.equal(report.provenance.sourceLineCount, 12);
  });

  it("does not double-count profit after nominal accounts close to retained earnings", () => {
    const book = ledger();
    post(book, "sale-2025", "2025-06-01", [
      { accountId: "cash", debit: Money.exact("100.00", usd) },
      { accountId: "sales", credit: Money.exact("100.00", usd) },
    ]);
    post(book, "close-2025", "2025-12-31", [
      { accountId: "sales", debit: Money.exact("100.00", usd) },
      { accountId: "retained-earnings", credit: Money.exact("100.00", usd) },
    ], "period-close");
    post(book, "sale-2026", "2026-04-01", [
      { accountId: "cash", debit: Money.exact("40.00", usd) },
      { accountId: "sales", credit: Money.exact("40.00", usd) },
    ]);
    post(book, "rent-2026", "2026-04-02", [
      { accountId: "rent", debit: Money.exact("10.00", usd) },
      { accountId: "cash", credit: Money.exact("10.00", usd) },
    ]);

    const report = builder(book).balanceSheet({ asOf: "2026-12-31" });
    assert.equal(report.totals.current.assets.toString(), "130.00 USD");
    assert.equal(report.totals.current.equityAccounts.toString(), "100.00 USD");
    assert.equal(report.totals.current.unclosedEarnings.toString(), "30.00 USD");
    assert.equal(report.totals.current.totalEquity.toString(), "130.00 USD");
    assert.equal(
      report.equity.find((row) => row.account.id === "retained-earnings")?.amount.current.toString(),
      "100.00 USD",
    );
  });

  it("preserves reversal drill-down while omitting exact zero balances by default", () => {
    const book = ledger();
    const original = book.post(
      {
        businessDate: "2026-03-01",
        source: { type: "sales-invoice", id: "voided-sale" },
        lines: [
          { accountId: "cash", debit: Money.exact("12.34", usd) },
          { accountId: "sales", credit: Money.exact("12.34", usd) },
        ],
      },
      { idempotencyKey: "post-voided-sale", actorId: "accountant-a" },
    );
    book.reverse(
      { journalId: original.id, businessDate: "2026-03-02", description: "Invoice voided" },
      { idempotencyKey: "reverse-voided-sale", actorId: "controller-a" },
    );

    const reporting = builder(book);
    const compact = reporting.incomeStatement({ from: "2026-01-01", to: "2026-12-31" });
    assert.equal(compact.revenue.some((row) => row.account.id === "sales"), false);
    assert.equal(compact.totals.current.netIncome.toString(), "0.00 USD");

    const expanded = reporting.incomeStatement({
      from: "2026-01-01",
      to: "2026-12-31",
      includeZeroBalances: true,
    });
    const sales = expanded.revenue.find((row) => row.account.id === "sales");
    assert.equal(sales?.amount.current.toString(), "0.00 USD");
    assert.equal(sales?.trace.current.length, 2);
    assert.equal(sales?.trace.current[1]?.source.type, "system.journal-reversal");
    assert.equal(sales?.trace.current[1]?.reversalOfJournalId, original.id);
    assert.equal(sales?.trace.current[1]?.postedBy, "controller-a");

    const balanceSheet = reporting.balanceSheet({ asOf: "2026-12-31" });
    assert.equal(balanceSheet.assets.length, 0);
    assert.equal(balanceSheet.totals.current.assets.toString(), "0.00 USD");
    assert.equal(balanceSheet.totals.current.liabilitiesAndEquity.toString(), "0.00 USD");
  });

  it("rejects a dimension-filtered balance sheet when the selected lines break the equation", () => {
    const book = ledger();
    post(book, "split-dimensions", "2026-05-01", [
      {
        accountId: "cash",
        debit: Money.exact("10.00", usd),
        dimensions: { region: "EU" },
      },
      {
        accountId: "sales",
        credit: Money.exact("10.00", usd),
        dimensions: { region: "US" },
      },
    ]);
    const reporting = builder(book);
    assert.throws(
      () => reporting.balanceSheet({
        asOf: "2026-12-31",
        filters: { dimensions: { region: "EU" } },
      }),
      errorCode("UNBALANCED_REPORT"),
    );

    const sourceFiltered = reporting.balanceSheet({
      asOf: "2026-12-31",
      filters: { sourceTypes: ["manual-journal"] },
    });
    assert.equal(sourceFiltered.totals.current.assets.toString(), "10.00 USD");
    assert.equal(sourceFiltered.totals.current.liabilitiesAndEquity.toString(), "10.00 USD");
  });

  it("enforces account profiles, report boundaries, and complete account classification", () => {
    const book = ledger();
    assert.throws(
      () => builder(book, [
        { id: "one", code: "1000", name: "One", classification: "asset" },
        { id: "two", code: "1000", name: "Two", classification: "liability" },
      ]),
      errorCode("INVALID_ACCOUNT"),
    );
    assert.throws(
      () => builder(book, [
        {
          id: "invalid-retained",
          code: "3000",
          name: "Invalid retained earnings",
          classification: "asset",
          role: "retained-earnings",
        },
      ]),
      errorCode("INVALID_ACCOUNT"),
    );

    const reporting = builder(book);
    assert.throws(
      () => reporting.generalLedger({ from: "2026-12-31", to: "2026-01-01" }),
      errorCode("INVALID_REPORT_QUERY"),
    );
    assert.throws(
      () => reporting.incomeStatement({
        from: "2026-01-01",
        to: "2026-12-31",
        comparison: { label: "Overlap", from: "2026-01-01", to: "2026-03-31" },
      }),
      errorCode("INVALID_REPORT_QUERY"),
    );
    assert.throws(
      () => reporting.balanceSheet({
        asOf: "2026-12-31",
        comparisonAsOf: "2026-12-31",
      }),
      errorCode("INVALID_REPORT_QUERY"),
    );

    post(book, "unknown-account", "2026-01-01", [
      { accountId: "mystery-asset", debit: Money.exact("1.00", usd) },
      { accountId: "capital", credit: Money.exact("1.00", usd) },
    ]);
    assert.throws(
      () => reporting.balanceSheet({ asOf: "2026-12-31" }),
      errorCode("INVALID_ACCOUNT"),
    );
  });
});

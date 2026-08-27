import {
  businessDate,
  compareBusinessDates,
  type BusinessDate,
} from "./business-date.js";
import { fail } from "./errors.js";
import {
  JournalLedger,
  type JournalSource,
  type PostedJournal,
  type PostedJournalLine,
} from "./journal.js";
import { Currency, Money } from "./money.js";

export type AccountClassification = "asset" | "liability" | "equity" | "revenue" | "expense";
export type NormalBalance = "debit" | "credit";
export type ReportingAccountRole = "retained-earnings";

export interface ReportingAccountInput {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly classification: AccountClassification;
  readonly isContra?: boolean;
  readonly role?: ReportingAccountRole;
}

export interface ReportingAccount {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly classification: AccountClassification;
  readonly isContra: boolean;
  readonly normalBalance: NormalBalance;
  readonly role: ReportingAccountRole | null;
}

export interface ManagementReportingPolicyInput {
  readonly id: string;
  readonly version: string;
  readonly name: string;
}

/**
 * A standards-neutral presentation policy. It deliberately makes no statutory
 * or financial-reporting-framework compliance assertion.
 */
export interface ManagementReportingPolicy {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly purpose: "management-reporting";
  readonly statutoryFrameworkAssertion: null;
}

export interface ReportFilterInput {
  /** Exact dimension matches; every supplied key must match a line. */
  readonly dimensions?: Readonly<Record<string, string>>;
  /** Exact journal source-type allow-list. */
  readonly sourceTypes?: readonly string[];
}

export interface ReportFilters {
  readonly dimensions: Readonly<Record<string, string>>;
  readonly sourceTypes: readonly string[] | null;
}

export interface ComparisonRangeInput {
  readonly label: string;
  readonly from: string | BusinessDate;
  readonly to: string | BusinessDate;
}

export interface ComparisonRange {
  readonly label: string;
  readonly from: BusinessDate;
  readonly to: BusinessDate;
}

export interface ReportJournalReference {
  readonly journalId: string;
  readonly businessDate: BusinessDate;
  readonly source: JournalSource;
  readonly postedAt: string;
  readonly postedBy: string;
  readonly softCloseOverrideReason: string | null;
  readonly reversalOfJournalId: string | null;
}

export interface LedgerLineTrace {
  readonly accountId: string;
  readonly journalId: string;
  readonly lineId: string;
  readonly businessDate: BusinessDate;
  readonly source: JournalSource;
  readonly postedAt: string;
  readonly postedBy: string;
  readonly softCloseOverrideReason: string | null;
  readonly reversalOfJournalId: string | null;
  readonly journalDescription: string | null;
  readonly lineDescription: string | null;
  readonly dimensions: Readonly<Record<string, string>>;
  readonly debit: Money | null;
  readonly credit: Money | null;
}

export interface ReportColumnTrace {
  readonly current: readonly LedgerLineTrace[];
  readonly comparison: readonly LedgerLineTrace[] | null;
}

export interface GeneralLedgerCriteria {
  readonly reportType: "general-ledger";
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly accountIds: readonly string[];
  readonly includeZeroBalances: boolean;
  readonly filters: ReportFilters;
}

export interface IncomeStatementCriteria {
  readonly reportType: "income-statement";
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly comparison: ComparisonRange | null;
  readonly includeZeroBalances: boolean;
  readonly filters: ReportFilters;
}

export interface BalanceSheetCriteria {
  readonly reportType: "balance-sheet";
  readonly asOf: BusinessDate;
  readonly comparisonAsOf: BusinessDate | null;
  readonly includeZeroBalances: boolean;
  readonly filters: ReportFilters;
}

export type ReportCriteria =
  | GeneralLedgerCriteria
  | IncomeStatementCriteria
  | BalanceSheetCriteria;

export interface ReportProvenance {
  readonly tenantId: string;
  readonly companyId: string;
  readonly bookId: string;
  readonly currency: Currency;
  readonly policy: ManagementReportingPolicy;
  readonly generatedAt: string;
  readonly criteria: ReportCriteria;
  readonly sourceJournals: readonly ReportJournalReference[];
  readonly sourceJournalCount: number;
  readonly sourceLineCount: number;
}

export interface AccountBalance {
  /** Debit-positive ledger balance represented on its resulting side. */
  readonly debit: Money;
  readonly credit: Money;
  /** Positive on the account's configured normal side; negative when abnormal. */
  readonly naturalAmount: Money;
  readonly normalBalance: NormalBalance;
}

export interface GeneralLedgerEntry extends LedgerLineTrace {
  readonly runningBalance: AccountBalance;
}

export interface GeneralLedgerAccount {
  readonly account: ReportingAccount;
  readonly openingBalance: AccountBalance;
  readonly entries: readonly GeneralLedgerEntry[];
  readonly periodDebit: Money;
  readonly periodCredit: Money;
  readonly endingBalance: AccountBalance;
}

export interface GeneralLedgerTotals {
  readonly openingDebit: Money;
  readonly openingCredit: Money;
  readonly periodDebit: Money;
  readonly periodCredit: Money;
  readonly endingDebit: Money;
  readonly endingCredit: Money;
}

export interface GeneralLedgerQuery {
  readonly from: string | BusinessDate;
  readonly to: string | BusinessDate;
  readonly accountIds?: readonly string[];
  readonly includeZeroBalances?: boolean;
  readonly filters?: ReportFilterInput;
}

export interface GeneralLedgerReport {
  readonly tenantId: string;
  readonly companyId: string;
  readonly bookId: string;
  readonly currency: Currency;
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly accounts: readonly GeneralLedgerAccount[];
  readonly totals: GeneralLedgerTotals;
  /** Selections may be intentionally unbalanced when filtered to part of the ledger. */
  readonly selectionBalanced: boolean;
  readonly provenance: ReportProvenance;
}

export interface IncomeStatementQuery {
  readonly from: string | BusinessDate;
  readonly to: string | BusinessDate;
  readonly comparison?: ComparisonRangeInput;
  readonly includeZeroBalances?: boolean;
  readonly filters?: ReportFilterInput;
}

export interface StatementAmount {
  readonly current: Money;
  readonly comparison: Money | null;
}

export interface IncomeStatementRow {
  readonly account: ReportingAccount;
  /** Revenue is credit-minus-debit; expense is debit-minus-credit. */
  readonly amount: StatementAmount;
  readonly trace: ReportColumnTrace;
}

export interface IncomeStatementColumnTotals {
  readonly revenue: Money;
  readonly expense: Money;
  readonly netIncome: Money;
}

export interface IncomeStatementReport {
  readonly tenantId: string;
  readonly companyId: string;
  readonly bookId: string;
  readonly currency: Currency;
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly comparison: ComparisonRange | null;
  readonly revenue: readonly IncomeStatementRow[];
  readonly expenses: readonly IncomeStatementRow[];
  readonly totals: {
    readonly current: IncomeStatementColumnTotals;
    readonly comparison: IncomeStatementColumnTotals | null;
  };
  readonly provenance: ReportProvenance;
}

export interface BalanceSheetQuery {
  readonly asOf: string | BusinessDate;
  readonly comparisonAsOf?: string | BusinessDate;
  readonly includeZeroBalances?: boolean;
  readonly filters?: ReportFilterInput;
}

export interface BalanceSheetRow {
  readonly account: ReportingAccount;
  /** Asset is debit-minus-credit; liability/equity is credit-minus-debit. */
  readonly amount: StatementAmount;
  readonly trace: ReportColumnTrace;
}

export interface BalanceSheetColumnTotals {
  readonly assets: Money;
  readonly liabilities: Money;
  readonly equityAccounts: Money;
  /** Cumulative revenue less expense still resident in nominal accounts. */
  readonly unclosedEarnings: Money;
  readonly totalEquity: Money;
  readonly liabilitiesAndEquity: Money;
}

export interface BalanceSheetReport {
  readonly tenantId: string;
  readonly companyId: string;
  readonly bookId: string;
  readonly currency: Currency;
  readonly asOf: BusinessDate;
  readonly comparisonAsOf: BusinessDate | null;
  readonly assets: readonly BalanceSheetRow[];
  readonly liabilities: readonly BalanceSheetRow[];
  readonly equity: readonly BalanceSheetRow[];
  readonly retainedEarningsAccountId: string | null;
  readonly unclosedEarningsTrace: ReportColumnTrace;
  readonly totals: {
    readonly current: BalanceSheetColumnTotals;
    readonly comparison: BalanceSheetColumnTotals | null;
  };
  readonly provenance: ReportProvenance;
}

export interface FinancialReportBuilderOptions {
  readonly ledger: JournalLedger;
  readonly accounts: readonly ReportingAccountInput[];
  readonly policy: ManagementReportingPolicyInput;
  readonly clock?: () => Date;
}

interface SnapshotLine {
  readonly journal: PostedJournal;
  readonly line: PostedJournalLine;
  readonly lineIndex: number;
}

interface LedgerSnapshot {
  readonly lines: readonly SnapshotLine[];
}

interface Activity {
  debit: Money;
  credit: Money;
  readonly lines: SnapshotLine[];
}

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const DIMENSION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const ACCOUNT_CLASSIFICATIONS = new Set<AccountClassification>([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

function compareText(left: string, right: string): -1 | 0 | 1 {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function requireReportText(value: unknown, field: string, maximumLength = 200): string {
  if (typeof value !== "string") {
    fail("INVALID_REPORT_QUERY", `${field} must be text.`, { field });
  }
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > maximumLength
    || CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    fail("INVALID_REPORT_QUERY", `${field} is empty, too long, or contains control characters.`, {
      field,
    });
  }
  return normalized;
}

function booleanOption(value: boolean | undefined, field: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    fail("INVALID_REPORT_QUERY", `${field} must be boolean.`, { field });
  }
  return value;
}

function normalBalanceFor(
  classification: AccountClassification,
  isContra: boolean,
): NormalBalance {
  const classificationBalance: NormalBalance = (
    classification === "asset" || classification === "expense"
  ) ? "debit" : "credit";
  if (!isContra) return classificationBalance;
  return classificationBalance === "debit" ? "credit" : "debit";
}

function freezeSource(source: JournalSource): JournalSource {
  return Object.freeze({ type: source.type, id: source.id });
}

function moneyForClassification(
  account: ReportingAccount,
  debit: Money,
  credit: Money,
): Money {
  return account.classification === "asset" || account.classification === "expense"
    ? debit.minus(credit)
    : credit.minus(debit);
}

function balanceFromNetDebit(account: ReportingAccount, netDebit: Money): AccountBalance {
  const debit = netDebit.isNegative() ? Money.zero(netDebit.currency) : netDebit;
  const credit = netDebit.isNegative() ? netDebit.absolute() : Money.zero(netDebit.currency);
  const naturalAmount = account.normalBalance === "debit" ? netDebit : netDebit.negated();
  return Object.freeze({ debit, credit, naturalAmount, normalBalance: account.normalBalance });
}

function compareJournals(left: PostedJournal, right: PostedJournal): number {
  return compareBusinessDates(left.businessDate, right.businessDate)
    || compareText(left.postedAt, right.postedAt)
    || compareText(left.id, right.id);
}

function compareSnapshotLines(left: SnapshotLine, right: SnapshotLine): number {
  return compareJournals(left.journal, right.journal)
    || left.lineIndex - right.lineIndex
    || compareText(left.line.id, right.line.id);
}

export class FinancialReportBuilder {
  readonly #ledger: JournalLedger;
  readonly #accounts: readonly ReportingAccount[];
  readonly #accountsById = new Map<string, ReportingAccount>();
  readonly #policy: ManagementReportingPolicy;
  readonly #clock: () => Date;

  constructor(options: FinancialReportBuilderOptions) {
    if (!(options.ledger instanceof JournalLedger)) {
      fail("INVALID_REPORT_QUERY", "Financial reports require a JournalLedger source.");
    }
    this.#ledger = options.ledger;
    this.#accounts = this.#normalizeAccounts(options.accounts);
    for (const account of this.#accounts) this.#accountsById.set(account.id, account);
    this.#policy = Object.freeze({
      id: requireReportText(options.policy.id, "policy.id"),
      version: requireReportText(options.policy.version, "policy.version", 50),
      name: requireReportText(options.policy.name, "policy.name"),
      purpose: "management-reporting" as const,
      statutoryFrameworkAssertion: null,
    });
    this.#clock = options.clock ?? (() => new Date());
  }

  generalLedger(query: GeneralLedgerQuery): GeneralLedgerReport {
    const from = businessDate(query.from);
    const to = businessDate(query.to);
    if (compareBusinessDates(from, to) > 0) {
      fail("INVALID_REPORT_QUERY", "General ledger start date cannot be after its end date.", {
        from,
        to,
      });
    }
    const filters = this.#normalizeFilters(query.filters);
    const includeZeroBalances = booleanOption(query.includeZeroBalances, "includeZeroBalances");
    const selectedAccounts = this.#selectAccounts(query.accountIds);
    const selectedIds = new Set(selectedAccounts.map((account) => account.id));
    const snapshot = this.#snapshot();
    const sourceLines = snapshot.lines.filter((item) => (
      compareBusinessDates(item.journal.businessDate, to) <= 0
      && selectedIds.has(item.line.accountId)
      && this.#matchesFilters(item, filters)
    ));

    const accounts: GeneralLedgerAccount[] = [];
    let openingDebit = Money.zero(this.#ledger.baseCurrency);
    let openingCredit = Money.zero(this.#ledger.baseCurrency);
    let periodDebit = Money.zero(this.#ledger.baseCurrency);
    let periodCredit = Money.zero(this.#ledger.baseCurrency);
    let endingDebit = Money.zero(this.#ledger.baseCurrency);
    let endingCredit = Money.zero(this.#ledger.baseCurrency);

    for (const account of selectedAccounts) {
      const accountLines = sourceLines.filter((item) => item.line.accountId === account.id);
      let openingNetDebit = Money.zero(this.#ledger.baseCurrency);
      const periodLines: SnapshotLine[] = [];
      for (const item of accountLines) {
        if (compareBusinessDates(item.journal.businessDate, from) < 0) {
          openingNetDebit = openingNetDebit
            .plus(item.line.debit ?? Money.zero(this.#ledger.baseCurrency))
            .minus(item.line.credit ?? Money.zero(this.#ledger.baseCurrency));
        } else {
          periodLines.push(item);
        }
      }

      let runningNetDebit = openingNetDebit;
      let accountPeriodDebit = Money.zero(this.#ledger.baseCurrency);
      let accountPeriodCredit = Money.zero(this.#ledger.baseCurrency);
      const entries = periodLines.map((item): GeneralLedgerEntry => {
        const debit = item.line.debit ?? Money.zero(this.#ledger.baseCurrency);
        const credit = item.line.credit ?? Money.zero(this.#ledger.baseCurrency);
        accountPeriodDebit = accountPeriodDebit.plus(debit);
        accountPeriodCredit = accountPeriodCredit.plus(credit);
        runningNetDebit = runningNetDebit.plus(debit).minus(credit);
        return Object.freeze({
          ...this.#lineTrace(item),
          runningBalance: balanceFromNetDebit(account, runningNetDebit),
        });
      });
      const openingBalance = balanceFromNetDebit(account, openingNetDebit);
      const endingBalance = balanceFromNetDebit(account, runningNetDebit);
      if (
        !includeZeroBalances
        && openingBalance.debit.isZero()
        && openingBalance.credit.isZero()
        && accountPeriodDebit.isZero()
        && accountPeriodCredit.isZero()
      ) continue;

      openingDebit = openingDebit.plus(openingBalance.debit);
      openingCredit = openingCredit.plus(openingBalance.credit);
      periodDebit = periodDebit.plus(accountPeriodDebit);
      periodCredit = periodCredit.plus(accountPeriodCredit);
      endingDebit = endingDebit.plus(endingBalance.debit);
      endingCredit = endingCredit.plus(endingBalance.credit);
      accounts.push(Object.freeze({
        account,
        openingBalance,
        entries: Object.freeze(entries),
        periodDebit: accountPeriodDebit,
        periodCredit: accountPeriodCredit,
        endingBalance,
      }));
    }

    const totals: GeneralLedgerTotals = Object.freeze({
      openingDebit,
      openingCredit,
      periodDebit,
      periodCredit,
      endingDebit,
      endingCredit,
    });
    const criteria: GeneralLedgerCriteria = Object.freeze({
      reportType: "general-ledger" as const,
      from,
      to,
      accountIds: Object.freeze(selectedAccounts.map((account) => account.id)),
      includeZeroBalances,
      filters,
    });
    return Object.freeze({
      tenantId: this.#ledger.tenantId,
      companyId: this.#ledger.companyId,
      bookId: this.#ledger.bookId,
      currency: this.#ledger.baseCurrency,
      from,
      to,
      accounts: Object.freeze(accounts),
      totals,
      selectionBalanced: openingDebit.equals(openingCredit)
        && periodDebit.equals(periodCredit)
        && endingDebit.equals(endingCredit),
      provenance: this.#provenance(criteria, sourceLines),
    });
  }

  incomeStatement(query: IncomeStatementQuery): IncomeStatementReport {
    const from = businessDate(query.from);
    const to = businessDate(query.to);
    if (compareBusinessDates(from, to) > 0) {
      fail("INVALID_REPORT_QUERY", "Income statement start date cannot be after its end date.", {
        from,
        to,
      });
    }
    const comparison = this.#normalizeComparison(query.comparison, from);
    const filters = this.#normalizeFilters(query.filters);
    const includeZeroBalances = booleanOption(query.includeZeroBalances, "includeZeroBalances");
    const snapshot = this.#snapshot();
    const statementAccounts = this.#accounts.filter((account) => (
      account.classification === "revenue" || account.classification === "expense"
    ));
    const currentLines = snapshot.lines.filter((item) => (
      (this.#accountsById.get(item.line.accountId)?.classification === "revenue"
        || this.#accountsById.get(item.line.accountId)?.classification === "expense")
      && compareBusinessDates(item.journal.businessDate, from) >= 0
      && compareBusinessDates(item.journal.businessDate, to) <= 0
      && this.#matchesFilters(item, filters)
    ));
    const comparisonLines = comparison === null ? [] : snapshot.lines.filter((item) => (
      (this.#accountsById.get(item.line.accountId)?.classification === "revenue"
        || this.#accountsById.get(item.line.accountId)?.classification === "expense")
      && compareBusinessDates(item.journal.businessDate, comparison.from) >= 0
      && compareBusinessDates(item.journal.businessDate, comparison.to) <= 0
      && this.#matchesFilters(item, filters)
    ));
    const currentActivity = this.#activity(currentLines);
    const comparisonActivity = this.#activity(comparisonLines);
    const revenue: IncomeStatementRow[] = [];
    const expenses: IncomeStatementRow[] = [];
    let currentRevenue = Money.zero(this.#ledger.baseCurrency);
    let currentExpense = Money.zero(this.#ledger.baseCurrency);
    let comparisonRevenue = Money.zero(this.#ledger.baseCurrency);
    let comparisonExpense = Money.zero(this.#ledger.baseCurrency);

    for (const account of statementAccounts) {
      const current = currentActivity.get(account.id) ?? this.#emptyActivity();
      const prior = comparisonActivity.get(account.id) ?? this.#emptyActivity();
      const currentAmount = moneyForClassification(account, current.debit, current.credit);
      const comparisonAmount = comparison === null
        ? null
        : moneyForClassification(account, prior.debit, prior.credit);
      if (
        !includeZeroBalances
        && currentAmount.isZero()
        && (comparisonAmount === null || comparisonAmount.isZero())
      ) continue;

      if (account.classification === "revenue") {
        currentRevenue = currentRevenue.plus(currentAmount);
        if (comparisonAmount !== null) comparisonRevenue = comparisonRevenue.plus(comparisonAmount);
      } else {
        currentExpense = currentExpense.plus(currentAmount);
        if (comparisonAmount !== null) comparisonExpense = comparisonExpense.plus(comparisonAmount);
      }
      const row: IncomeStatementRow = Object.freeze({
        account,
        amount: Object.freeze({ current: currentAmount, comparison: comparisonAmount }),
        trace: Object.freeze({
          current: Object.freeze(current.lines.map((item) => this.#lineTrace(item))),
          comparison: comparison === null
            ? null
            : Object.freeze(prior.lines.map((item) => this.#lineTrace(item))),
        }),
      });
      (account.classification === "revenue" ? revenue : expenses).push(row);
    }

    const currentTotals = this.#incomeStatementTotals(currentRevenue, currentExpense);
    const comparisonTotals = comparison === null
      ? null
      : this.#incomeStatementTotals(comparisonRevenue, comparisonExpense);
    const criteria: IncomeStatementCriteria = Object.freeze({
      reportType: "income-statement" as const,
      from,
      to,
      comparison,
      includeZeroBalances,
      filters,
    });
    return Object.freeze({
      tenantId: this.#ledger.tenantId,
      companyId: this.#ledger.companyId,
      bookId: this.#ledger.bookId,
      currency: this.#ledger.baseCurrency,
      from,
      to,
      comparison,
      revenue: Object.freeze(revenue),
      expenses: Object.freeze(expenses),
      totals: Object.freeze({ current: currentTotals, comparison: comparisonTotals }),
      provenance: this.#provenance(criteria, [...currentLines, ...comparisonLines]),
    });
  }

  balanceSheet(query: BalanceSheetQuery): BalanceSheetReport {
    const asOf = businessDate(query.asOf);
    const comparisonAsOf = query.comparisonAsOf === undefined
      ? null
      : businessDate(query.comparisonAsOf);
    if (comparisonAsOf !== null && compareBusinessDates(comparisonAsOf, asOf) >= 0) {
      fail("INVALID_REPORT_QUERY", "Balance sheet comparison date must precede the current date.", {
        asOf,
        comparisonAsOf,
      });
    }
    const filters = this.#normalizeFilters(query.filters);
    const includeZeroBalances = booleanOption(query.includeZeroBalances, "includeZeroBalances");
    const snapshot = this.#snapshot();
    const currentLines = snapshot.lines.filter((item) => (
      compareBusinessDates(item.journal.businessDate, asOf) <= 0
      && this.#matchesFilters(item, filters)
    ));
    const comparisonLines = comparisonAsOf === null ? [] : snapshot.lines.filter((item) => (
      compareBusinessDates(item.journal.businessDate, comparisonAsOf) <= 0
      && this.#matchesFilters(item, filters)
    ));
    const currentActivity = this.#activity(currentLines);
    const comparisonActivity = this.#activity(comparisonLines);
    const assets: BalanceSheetRow[] = [];
    const liabilities: BalanceSheetRow[] = [];
    const equity: BalanceSheetRow[] = [];
    let currentAssets = Money.zero(this.#ledger.baseCurrency);
    let currentLiabilities = Money.zero(this.#ledger.baseCurrency);
    let currentEquity = Money.zero(this.#ledger.baseCurrency);
    let comparisonAssets = Money.zero(this.#ledger.baseCurrency);
    let comparisonLiabilities = Money.zero(this.#ledger.baseCurrency);
    let comparisonEquity = Money.zero(this.#ledger.baseCurrency);

    for (const account of this.#accounts) {
      if (account.classification === "revenue" || account.classification === "expense") continue;
      const current = currentActivity.get(account.id) ?? this.#emptyActivity();
      const prior = comparisonActivity.get(account.id) ?? this.#emptyActivity();
      const currentAmount = moneyForClassification(account, current.debit, current.credit);
      const comparisonAmount = comparisonAsOf === null
        ? null
        : moneyForClassification(account, prior.debit, prior.credit);
      if (
        !includeZeroBalances
        && currentAmount.isZero()
        && (comparisonAmount === null || comparisonAmount.isZero())
      ) continue;

      switch (account.classification) {
        case "asset":
          currentAssets = currentAssets.plus(currentAmount);
          if (comparisonAmount !== null) comparisonAssets = comparisonAssets.plus(comparisonAmount);
          break;
        case "liability":
          currentLiabilities = currentLiabilities.plus(currentAmount);
          if (comparisonAmount !== null) {
            comparisonLiabilities = comparisonLiabilities.plus(comparisonAmount);
          }
          break;
        case "equity":
          currentEquity = currentEquity.plus(currentAmount);
          if (comparisonAmount !== null) comparisonEquity = comparisonEquity.plus(comparisonAmount);
          break;
      }
      const row: BalanceSheetRow = Object.freeze({
        account,
        amount: Object.freeze({ current: currentAmount, comparison: comparisonAmount }),
        trace: Object.freeze({
          current: Object.freeze(current.lines.map((item) => this.#lineTrace(item))),
          comparison: comparisonAsOf === null
            ? null
            : Object.freeze(prior.lines.map((item) => this.#lineTrace(item))),
        }),
      });
      if (account.classification === "asset") assets.push(row);
      if (account.classification === "liability") liabilities.push(row);
      if (account.classification === "equity") equity.push(row);
    }

    const currentNominalLines = currentLines.filter((item) => {
      const classification = this.#accountsById.get(item.line.accountId)?.classification;
      return classification === "revenue" || classification === "expense";
    });
    const comparisonNominalLines = comparisonLines.filter((item) => {
      const classification = this.#accountsById.get(item.line.accountId)?.classification;
      return classification === "revenue" || classification === "expense";
    });
    const currentUnclosedEarnings = this.#unclosedEarnings(currentActivity);
    const comparisonUnclosedEarnings = comparisonAsOf === null
      ? null
      : this.#unclosedEarnings(comparisonActivity);
    const currentTotals = this.#balanceSheetTotals(
      currentAssets,
      currentLiabilities,
      currentEquity,
      currentUnclosedEarnings,
      asOf,
      "current",
    );
    const comparisonTotals = comparisonAsOf === null || comparisonUnclosedEarnings === null
      ? null
      : this.#balanceSheetTotals(
        comparisonAssets,
        comparisonLiabilities,
        comparisonEquity,
        comparisonUnclosedEarnings,
        comparisonAsOf,
        "comparison",
      );
    const criteria: BalanceSheetCriteria = Object.freeze({
      reportType: "balance-sheet" as const,
      asOf,
      comparisonAsOf,
      includeZeroBalances,
      filters,
    });
    return Object.freeze({
      tenantId: this.#ledger.tenantId,
      companyId: this.#ledger.companyId,
      bookId: this.#ledger.bookId,
      currency: this.#ledger.baseCurrency,
      asOf,
      comparisonAsOf,
      assets: Object.freeze(assets),
      liabilities: Object.freeze(liabilities),
      equity: Object.freeze(equity),
      retainedEarningsAccountId: this.#accounts.find((account) => (
        account.role === "retained-earnings"
      ))?.id ?? null,
      unclosedEarningsTrace: Object.freeze({
        current: Object.freeze(currentNominalLines.map((item) => this.#lineTrace(item))),
        comparison: comparisonAsOf === null
          ? null
          : Object.freeze(comparisonNominalLines.map((item) => this.#lineTrace(item))),
      }),
      totals: Object.freeze({ current: currentTotals, comparison: comparisonTotals }),
      provenance: this.#provenance(criteria, [...currentLines, ...comparisonLines]),
    });
  }

  #normalizeAccounts(inputs: readonly ReportingAccountInput[]): readonly ReportingAccount[] {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      fail("INVALID_ACCOUNT", "Financial reporting requires at least one account definition.");
    }
    const identifiers = new Set<string>();
    const codes = new Set<string>();
    let retainedEarningsCount = 0;
    const accounts = inputs.map((input): ReportingAccount => {
      const id = requireReportText(input.id, "account.id");
      const code = requireReportText(input.code, "account.code", 100);
      const name = requireReportText(input.name, "account.name");
      if (identifiers.has(id) || codes.has(code)) {
        fail("INVALID_ACCOUNT", "Reporting account identifiers and codes must be unique.", {
          id,
          code,
        });
      }
      identifiers.add(id);
      codes.add(code);
      if (!ACCOUNT_CLASSIFICATIONS.has(input.classification)) {
        fail("INVALID_ACCOUNT", "Reporting account classification is invalid.", { id });
      }
      const isContra = input.isContra ?? false;
      if (typeof isContra !== "boolean") {
        fail("INVALID_ACCOUNT", "Reporting account contra flag must be boolean.", { id });
      }
      const role = input.role ?? null;
      if (role !== null && role !== "retained-earnings") {
        fail("INVALID_ACCOUNT", "Reporting account role is invalid.", { id });
      }
      if (role === "retained-earnings") {
        retainedEarningsCount += 1;
        if (input.classification !== "equity" || isContra) {
          fail(
            "INVALID_ACCOUNT",
            "Retained earnings must be a non-contra equity account.",
            { id },
          );
        }
      }
      return Object.freeze({
        id,
        code,
        name,
        classification: input.classification,
        isContra,
        normalBalance: normalBalanceFor(input.classification, isContra),
        role,
      });
    });
    if (retainedEarningsCount > 1) {
      fail("INVALID_ACCOUNT", "Only one retained-earnings account may be configured.");
    }
    accounts.sort((left, right) => compareText(left.code, right.code) || compareText(left.id, right.id));
    return Object.freeze(accounts);
  }

  #normalizeFilters(input: ReportFilterInput | undefined): ReportFilters {
    if (
      input?.dimensions !== undefined
      && (
        input.dimensions === null
        || typeof input.dimensions !== "object"
        || Array.isArray(input.dimensions)
      )
    ) {
      fail("INVALID_REPORT_QUERY", "Report dimensions must be a record.");
    }
    const dimensionEntries = input?.dimensions === undefined
      ? []
      : Object.entries(input.dimensions).map(([keyInput, valueInput]) => {
        const key = keyInput.trim();
        if (!DIMENSION_KEY_PATTERN.test(key)) {
          fail("INVALID_REPORT_QUERY", "Report dimension key has an invalid format.", { key });
        }
        return [key, requireReportText(valueInput, `filters.dimensions.${key}`)] as const;
      });
    dimensionEntries.sort(([left], [right]) => compareText(left, right));
    const dimensions = Object.freeze(Object.fromEntries(dimensionEntries));
    let sourceTypes: readonly string[] | null = null;
    if (input?.sourceTypes !== undefined) {
      if (!Array.isArray(input.sourceTypes) || input.sourceTypes.length === 0) {
        fail("INVALID_REPORT_QUERY", "Report source-type filter cannot be empty.");
      }
      const normalized = input.sourceTypes.map((sourceType, index) => (
        requireReportText(sourceType, `filters.sourceTypes[${index}]`)
      ));
      if (new Set(normalized).size !== normalized.length) {
        fail("INVALID_REPORT_QUERY", "Report source-type filter contains duplicates.");
      }
      normalized.sort(compareText);
      sourceTypes = Object.freeze(normalized);
    }
    return Object.freeze({ dimensions, sourceTypes });
  }

  #normalizeComparison(
    input: ComparisonRangeInput | undefined,
    currentFrom: BusinessDate,
  ): ComparisonRange | null {
    if (input === undefined) return null;
    const from = businessDate(input.from);
    const to = businessDate(input.to);
    if (compareBusinessDates(from, to) > 0 || compareBusinessDates(to, currentFrom) >= 0) {
      fail(
        "INVALID_REPORT_QUERY",
        "Income statement comparison must be a valid range ending before the current range.",
        { from, to, currentFrom },
      );
    }
    return Object.freeze({
      label: requireReportText(input.label, "comparison.label", 100),
      from,
      to,
    });
  }

  #selectAccounts(accountIdsInput: readonly string[] | undefined): readonly ReportingAccount[] {
    if (accountIdsInput === undefined) return this.#accounts;
    if (!Array.isArray(accountIdsInput) || accountIdsInput.length === 0) {
      fail("INVALID_REPORT_QUERY", "General ledger account filter cannot be empty.");
    }
    const requested = new Set<string>();
    for (const [index, accountIdInput] of accountIdsInput.entries()) {
      const accountId = requireReportText(accountIdInput, `accountIds[${index}]`);
      if (requested.has(accountId)) {
        fail("INVALID_REPORT_QUERY", "General ledger account filter contains duplicates.", {
          accountId,
        });
      }
      if (!this.#accountsById.has(accountId)) {
        fail("INVALID_ACCOUNT", "General ledger account filter contains an unknown account.", {
          accountId,
        });
      }
      requested.add(accountId);
    }
    return Object.freeze(this.#accounts.filter((account) => requested.has(account.id)));
  }

  #snapshot(): LedgerSnapshot {
    const journals = [...this.#ledger.listJournals()].sort(compareJournals);
    const journalIds = new Set<string>();
    const lineIds = new Set<string>();
    const lines: SnapshotLine[] = [];
    for (const journal of journals) {
      if (
        journal.status !== "posted"
        || !Object.isFrozen(journal)
        || !Object.isFrozen(journal.lines)
        || !Object.isFrozen(journal.source)
      ) {
        fail("REPORT_SOURCE_INVALID", "Reports accept only immutable posted journals.", {
          journalId: journal.id,
        });
      }
      if (
        journal.tenantId !== this.#ledger.tenantId
        || journal.companyId !== this.#ledger.companyId
        || journal.bookId !== this.#ledger.bookId
      ) {
        fail("REPORT_SOURCE_INVALID", "Journal scope does not match the reporting ledger.", {
          journalId: journal.id,
        });
      }
      businessDate(journal.businessDate);
      if (journalIds.has(journal.id)) {
        fail("REPORT_SOURCE_INVALID", "Report source contains a duplicate journal identifier.", {
          journalId: journal.id,
        });
      }
      journalIds.add(journal.id);
      const postedAt = new Date(journal.postedAt);
      if (
        !Number.isFinite(postedAt.getTime())
        || postedAt.toISOString() !== journal.postedAt
      ) {
        fail("REPORT_SOURCE_INVALID", "Journal posting timestamp is invalid.", {
          journalId: journal.id,
        });
      }
      if (!(journal.totalDebit instanceof Money) || !(journal.totalCredit instanceof Money)) {
        fail("REPORT_SOURCE_INVALID", "Journal totals must be exact Money values.", {
          journalId: journal.id,
        });
      }
      if (
        !journal.totalDebit.currency.equals(this.#ledger.baseCurrency)
        || !journal.totalCredit.currency.equals(this.#ledger.baseCurrency)
        || journal.lines.length < 2
      ) {
        fail("REPORT_SOURCE_INVALID", "Journal totals, currency, or line count are invalid.", {
          journalId: journal.id,
        });
      }
      let totalDebit = Money.zero(this.#ledger.baseCurrency);
      let totalCredit = Money.zero(this.#ledger.baseCurrency);
      for (const [lineIndex, line] of journal.lines.entries()) {
        if (!Object.isFrozen(line) || !Object.isFrozen(line.dimensions)) {
          fail("REPORT_SOURCE_INVALID", "Report source journal lines must be immutable.", {
            journalId: journal.id,
            lineId: line.id,
          });
        }
        if (lineIds.has(line.id)) {
          fail("REPORT_SOURCE_INVALID", "Report source contains a duplicate line identifier.", {
            lineId: line.id,
          });
        }
        lineIds.add(line.id);
        if (!this.#accountsById.has(line.accountId)) {
          fail("INVALID_ACCOUNT", "Posted journal line has no reporting account definition.", {
            journalId: journal.id,
            lineId: line.id,
            accountId: line.accountId,
          });
        }
        const debitProvided = line.debit !== null;
        const creditProvided = line.credit !== null;
        if (debitProvided === creditProvided) {
          fail("REPORT_SOURCE_INVALID", "Posted journal line must have exactly one side.", {
            journalId: journal.id,
            lineId: line.id,
          });
        }
        const amount = line.debit ?? line.credit;
        if (!(amount instanceof Money) || !amount.isPositive()) {
          fail("REPORT_SOURCE_INVALID", "Posted journal line must contain positive exact Money.", {
            journalId: journal.id,
            lineId: line.id,
          });
        }
        if (!amount.currency.equals(this.#ledger.baseCurrency)) {
          fail("REPORT_SOURCE_INVALID", "Posted journal line currency differs from the report.", {
            journalId: journal.id,
            lineId: line.id,
          });
        }
        if (line.debit !== null) totalDebit = totalDebit.plus(line.debit);
        if (line.credit !== null) totalCredit = totalCredit.plus(line.credit);
        lines.push(Object.freeze({ journal, line, lineIndex }));
      }
      if (
        totalDebit.isZero()
        || !totalDebit.equals(totalCredit)
        || !totalDebit.equals(journal.totalDebit)
        || !totalCredit.equals(journal.totalCredit)
      ) {
        fail("REPORT_SOURCE_INVALID", "Report source journal is not exactly balanced.", {
          journalId: journal.id,
        });
      }
    }
    lines.sort(compareSnapshotLines);
    return Object.freeze({ lines: Object.freeze(lines) });
  }

  #matchesFilters(item: SnapshotLine, filters: ReportFilters): boolean {
    if (filters.sourceTypes !== null && !filters.sourceTypes.includes(item.journal.source.type)) {
      return false;
    }
    return Object.entries(filters.dimensions).every(([key, value]) => (
      item.line.dimensions[key] === value
    ));
  }

  #activity(lines: readonly SnapshotLine[]): Map<string, Activity> {
    const result = new Map<string, Activity>();
    for (const item of lines) {
      const activity = result.get(item.line.accountId) ?? this.#emptyActivity();
      if (item.line.debit !== null) activity.debit = activity.debit.plus(item.line.debit);
      if (item.line.credit !== null) activity.credit = activity.credit.plus(item.line.credit);
      activity.lines.push(item);
      result.set(item.line.accountId, activity);
    }
    return result;
  }

  #emptyActivity(): Activity {
    return {
      debit: Money.zero(this.#ledger.baseCurrency),
      credit: Money.zero(this.#ledger.baseCurrency),
      lines: [],
    };
  }

  #lineTrace(item: SnapshotLine): LedgerLineTrace {
    return Object.freeze({
      accountId: item.line.accountId,
      journalId: item.journal.id,
      lineId: item.line.id,
      businessDate: item.journal.businessDate,
      source: freezeSource(item.journal.source),
      postedAt: item.journal.postedAt,
      postedBy: item.journal.postedBy,
      softCloseOverrideReason: item.journal.softCloseOverrideReason,
      reversalOfJournalId: item.journal.reversalOfJournalId,
      journalDescription: item.journal.description,
      lineDescription: item.line.description,
      dimensions: item.line.dimensions,
      debit: item.line.debit,
      credit: item.line.credit,
    });
  }

  #incomeStatementTotals(
    revenue: Money,
    expense: Money,
  ): IncomeStatementColumnTotals {
    const netIncome = revenue.minus(expense);
    return Object.freeze({ revenue, expense, netIncome });
  }

  #unclosedEarnings(activity: ReadonlyMap<string, Activity>): Money {
    let revenue = Money.zero(this.#ledger.baseCurrency);
    let expense = Money.zero(this.#ledger.baseCurrency);
    for (const account of this.#accounts) {
      if (account.classification !== "revenue" && account.classification !== "expense") continue;
      const value = activity.get(account.id) ?? this.#emptyActivity();
      const amount = moneyForClassification(account, value.debit, value.credit);
      if (account.classification === "revenue") revenue = revenue.plus(amount);
      if (account.classification === "expense") expense = expense.plus(amount);
    }
    return revenue.minus(expense);
  }

  #balanceSheetTotals(
    assets: Money,
    liabilities: Money,
    equityAccounts: Money,
    unclosedEarnings: Money,
    asOf: BusinessDate,
    column: "current" | "comparison",
  ): BalanceSheetColumnTotals {
    const totalEquity = equityAccounts.plus(unclosedEarnings);
    const liabilitiesAndEquity = liabilities.plus(totalEquity);
    if (!assets.equals(liabilitiesAndEquity)) {
      fail("UNBALANCED_REPORT", "Balance sheet does not satisfy assets = liabilities + equity.", {
        asOf,
        column,
        assets: assets.amount.toFixed(this.#ledger.baseCurrency.minorUnit),
        liabilitiesAndEquity: liabilitiesAndEquity.amount.toFixed(
          this.#ledger.baseCurrency.minorUnit,
        ),
      });
    }
    return Object.freeze({
      assets,
      liabilities,
      equityAccounts,
      unclosedEarnings,
      totalEquity,
      liabilitiesAndEquity,
    });
  }

  #provenance(criteria: ReportCriteria, sourceLinesInput: readonly SnapshotLine[]): ReportProvenance {
    const generated = this.#clock();
    if (!(generated instanceof Date) || !Number.isFinite(generated.getTime())) {
      fail("INVALID_REPORT_QUERY", "Report clock returned an invalid timestamp.");
    }
    const uniqueLines = new Map<string, SnapshotLine>();
    for (const item of [...sourceLinesInput].sort(compareSnapshotLines)) {
      if (!uniqueLines.has(item.line.id)) uniqueLines.set(item.line.id, item);
    }
    const journals = new Map<string, PostedJournal>();
    for (const item of uniqueLines.values()) {
      if (!journals.has(item.journal.id)) journals.set(item.journal.id, item.journal);
    }
    const sourceJournals = [...journals.values()].sort(compareJournals).map((journal) => Object.freeze({
      journalId: journal.id,
      businessDate: journal.businessDate,
      source: freezeSource(journal.source),
      postedAt: journal.postedAt,
      postedBy: journal.postedBy,
      softCloseOverrideReason: journal.softCloseOverrideReason,
      reversalOfJournalId: journal.reversalOfJournalId,
    }));
    return Object.freeze({
      tenantId: this.#ledger.tenantId,
      companyId: this.#ledger.companyId,
      bookId: this.#ledger.bookId,
      currency: this.#ledger.baseCurrency,
      policy: this.#policy,
      generatedAt: generated.toISOString(),
      criteria,
      sourceJournals: Object.freeze(sourceJournals),
      sourceJournalCount: sourceJournals.length,
      sourceLineCount: uniqueLines.size,
    });
  }
}

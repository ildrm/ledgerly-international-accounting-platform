import {
  businessDate,
  compareBusinessDates,
  isBusinessDateInRange,
  type BusinessDate,
} from "./business-date.js";
import { Decimal } from "./decimal.js";
import { fail } from "./errors.js";
import { Currency, Money } from "./money.js";

export type PeriodStatus = "open" | "soft-closed" | "hard-closed";

export interface FiscalPeriodInput {
  readonly id: string;
  readonly startDate: string | BusinessDate;
  readonly endDate: string | BusinessDate;
  readonly status?: PeriodStatus;
}

export interface FiscalPeriod {
  readonly id: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly status: PeriodStatus;
}

export interface PeriodChangeContext {
  readonly actorId: string;
  readonly reason: string;
  readonly hardCloseReopenAuthorization?: HardCloseReopenAuthorization;
}

export interface HardCloseReopenAuthorization {
  readonly capability: "period.reopen.hard-closed";
  readonly grantId: string;
  readonly authorizedBy: string;
}

export interface PeriodStatusChange {
  readonly id: string;
  readonly periodId: string;
  readonly previousStatus: PeriodStatus;
  readonly newStatus: PeriodStatus;
  readonly actorId: string;
  readonly reason: string;
  readonly authorizationGrantId: string | null;
  readonly authorizedBy: string | null;
  readonly changedAt: string;
}

export interface JournalSourceInput {
  readonly type: string;
  readonly id: string;
}

export interface JournalSource {
  readonly type: string;
  readonly id: string;
}

export interface JournalLineInput {
  readonly accountId: string;
  readonly debit?: Money;
  readonly credit?: Money;
  readonly description?: string;
  readonly dimensions?: Readonly<Record<string, string>>;
}

export interface PostJournalCommand {
  readonly businessDate: string | BusinessDate;
  readonly source: JournalSourceInput;
  readonly description?: string;
  readonly lines: readonly JournalLineInput[];
}

export interface PostingContext {
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly softCloseOverride?: {
    readonly reason: string;
  };
}

export interface ReverseJournalCommand {
  readonly journalId: string;
  readonly businessDate: string | BusinessDate;
  readonly description?: string;
}

export interface PostedJournalLine {
  readonly id: string;
  readonly accountId: string;
  readonly debit: Money | null;
  readonly credit: Money | null;
  readonly description: string | null;
  readonly dimensions: Readonly<Record<string, string>>;
}

export interface PostedJournal {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly bookId: string;
  readonly periodId: string;
  readonly businessDate: BusinessDate;
  readonly source: JournalSource;
  readonly description: string | null;
  readonly lines: readonly PostedJournalLine[];
  readonly totalDebit: Money;
  readonly totalCredit: Money;
  readonly status: "posted";
  readonly postedAt: string;
  readonly postedBy: string;
  readonly idempotencyKey: string;
  readonly softCloseOverrideReason: string | null;
  readonly reversalOfJournalId: string | null;
}

export interface JournalLedgerOptions {
  readonly tenantId: string;
  readonly companyId: string;
  readonly bookId: string;
  readonly baseCurrency: Currency;
  readonly periods: readonly FiscalPeriodInput[];
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
}

export interface TrialBalanceQuery {
  readonly from: string | BusinessDate;
  readonly to: string | BusinessDate;
}

export interface TrialBalanceRow {
  readonly accountId: string;
  readonly openingDebit: Money;
  readonly openingCredit: Money;
  readonly periodDebit: Money;
  readonly periodCredit: Money;
  readonly endingDebit: Money;
  readonly endingCredit: Money;
}

export interface TrialBalanceTotals {
  readonly openingDebit: Money;
  readonly openingCredit: Money;
  readonly periodDebit: Money;
  readonly periodCredit: Money;
  readonly endingDebit: Money;
  readonly endingCredit: Money;
}

export interface TrialBalance {
  readonly tenantId: string;
  readonly companyId: string;
  readonly bookId: string;
  readonly currency: Currency;
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly rows: readonly TrialBalanceRow[];
  readonly totals: TrialBalanceTotals;
}

interface InternalPeriod {
  readonly id: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  status: PeriodStatus;
}

interface NormalizedLine {
  readonly accountId: string;
  readonly debit: Money | null;
  readonly credit: Money | null;
  readonly description: string | null;
  readonly dimensions: Readonly<Record<string, string>>;
}

interface NormalizedJournal {
  readonly businessDate: BusinessDate;
  readonly source: JournalSource;
  readonly description: string | null;
  readonly lines: readonly NormalizedLine[];
  readonly totalDebit: Money;
  readonly totalCredit: Money;
}

interface NormalizedPostingContext {
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly softCloseOverrideReason: string | null;
}

interface NormalizedPeriodChangeContext {
  readonly actorId: string;
  readonly reason: string;
  readonly hardCloseReopenAuthorization: HardCloseReopenAuthorization | null;
}

interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly journalId: string;
}

interface TrialAccumulator {
  openingNet: Decimal;
  periodDebit: Decimal;
  periodCredit: Decimal;
}

const MAX_JOURNAL_LINES = 10_000;
const MAX_DIMENSIONS_PER_LINE = 20;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const DIMENSION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const INTERNAL_SOURCE_TYPE = "system.journal-reversal";

function defaultIdGenerator(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    fail("INVALID_JOURNAL", "A secure journal identifier generator is required.");
  }
  return globalThis.crypto.randomUUID();
}

function requireText(value: unknown, field: string, maximumLength = 200): string {
  if (typeof value !== "string") {
    fail("INVALID_JOURNAL", `${field} must be text.`, { field });
  }
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > maximumLength
    || CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    fail("INVALID_JOURNAL", `${field} is empty, too long, or contains control characters.`, {
      field,
    });
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maximumLength = 2_000): string | null {
  if (value === undefined) return null;
  return requireText(value, field, maximumLength);
}

function freezeDimensions(
  dimensionsInput: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  if (dimensionsInput === undefined) return Object.freeze({});
  if (dimensionsInput === null || typeof dimensionsInput !== "object" || Array.isArray(dimensionsInput)) {
    fail("INVALID_JOURNAL", "Journal line dimensions must be a record.");
  }

  const entries = Object.entries(dimensionsInput);
  if (entries.length > MAX_DIMENSIONS_PER_LINE) {
    fail("INVALID_JOURNAL", "Journal line has too many accounting dimensions.", {
      maximum: String(MAX_DIMENSIONS_PER_LINE),
    });
  }

  const normalized = entries.map(([keyInput, valueInput]) => {
    const key = keyInput.trim();
    if (!DIMENSION_KEY_PATTERN.test(key)) {
      fail("INVALID_JOURNAL", "Accounting dimension key has an invalid format.", { key });
    }
    const value = requireText(valueInput, `dimension.${key}`, 200);
    return [key, value] as const;
  });
  normalized.sort(([left], [right]) => left.localeCompare(right, "en"));
  return Object.freeze(Object.fromEntries(normalized));
}

function sourceKey(source: JournalSource): string {
  return `${source.type}\u0000${source.id}`;
}

function moneyFingerprint(value: Money | null): string | null {
  return value === null ? null : value.amount.toFixed(value.currency.minorUnit);
}

function positiveAndNegativeParts(value: Decimal, currency: Currency): readonly [Money, Money] {
  if (value.isNegative()) {
    return [Money.zero(currency), Money.exact(value.absolute(), currency)] as const;
  }
  return [Money.exact(value, currency), Money.zero(currency)] as const;
}

function periodSnapshot(period: InternalPeriod): FiscalPeriod {
  return Object.freeze({
    id: period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
  });
}

export class JournalLedger {
  readonly tenantId: string;
  readonly companyId: string;
  readonly bookId: string;
  readonly baseCurrency: Currency;

  readonly #idGenerator: () => string;
  readonly #clock: () => Date;
  readonly #periods: InternalPeriod[];
  readonly #periodsById = new Map<string, InternalPeriod>();
  readonly #journals = new Map<string, PostedJournal>();
  readonly #journalOrder: string[] = [];
  readonly #sourceIndex = new Map<string, string>();
  readonly #idempotencyIndex = new Map<string, IdempotencyRecord>();
  readonly #reversalIndex = new Map<string, string>();
  readonly #periodChanges: PeriodStatusChange[] = [];
  readonly #allocatedIds = new Set<string>();

  constructor(options: JournalLedgerOptions) {
    this.tenantId = requireText(options.tenantId, "tenantId");
    this.companyId = requireText(options.companyId, "companyId");
    this.bookId = requireText(options.bookId, "bookId");
    if (!(options.baseCurrency instanceof Currency)) {
      fail("INVALID_CURRENCY", "Journal ledger requires a valid base currency.");
    }
    this.baseCurrency = options.baseCurrency;
    this.#idGenerator = options.idGenerator ?? defaultIdGenerator;
    this.#clock = options.clock ?? (() => new Date());
    this.#periods = this.#normalizePeriods(options.periods);
    for (const period of this.#periods) this.#periodsById.set(period.id, period);
  }

  post(command: PostJournalCommand, contextInput: PostingContext): PostedJournal {
    const normalized = this.#normalizeJournal(command, false);
    const context = this.#normalizePostingContext(contextInput);
    const fingerprint = this.#postingFingerprint("post", normalized, context, null);
    const replay = this.#idempotentReplay(context.idempotencyKey, fingerprint);
    if (replay !== null) return replay;

    if (this.#sourceIndex.has(sourceKey(normalized.source))) {
      fail("DUPLICATE_SOURCE", "A journal has already been posted for this source.", {
        sourceType: normalized.source.type,
        sourceId: normalized.source.id,
      });
    }

    return this.#commit(normalized, context, fingerprint, null);
  }

  reverse(command: ReverseJournalCommand, contextInput: PostingContext): PostedJournal {
    const journalId = requireText(command.journalId, "journalId");
    const reversalDate = businessDate(command.businessDate);
    const description = optionalText(command.description, "description")
      ?? `Reversal of journal ${journalId}`;
    const context = this.#normalizePostingContext(contextInput);
    const reversalFingerprint = JSON.stringify({
      kind: "reverse",
      journalId,
      businessDate: reversalDate,
      description,
      actorId: context.actorId,
      softCloseOverrideReason: context.softCloseOverrideReason,
    });
    const replay = this.#idempotentReplay(context.idempotencyKey, reversalFingerprint);
    if (replay !== null) return replay;

    const original = this.#journals.get(journalId);
    if (original === undefined) {
      fail("JOURNAL_NOT_FOUND", "The journal to reverse does not exist.", { journalId });
    }
    if (original.reversalOfJournalId !== null) {
      fail("REVERSAL_NOT_ALLOWED", "A reversal journal cannot itself be reversed automatically.", {
        journalId,
      });
    }
    const existingReversal = this.#reversalIndex.get(journalId);
    if (existingReversal !== undefined) {
      fail("ALREADY_REVERSED", "The journal already has a reversal.", {
        journalId,
        reversalJournalId: existingReversal,
      });
    }

    const normalized: NormalizedJournal = {
      businessDate: reversalDate,
      source: Object.freeze({ type: INTERNAL_SOURCE_TYPE, id: journalId }),
      description,
      lines: Object.freeze(original.lines.map((line) => Object.freeze({
        accountId: line.accountId,
        debit: line.credit,
        credit: line.debit,
        description: line.description,
        dimensions: line.dimensions,
      }))),
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
    };

    return this.#commit(normalized, context, reversalFingerprint, journalId);
  }

  closePeriod(
    periodIdInput: string,
    targetStatus: "soft-closed" | "hard-closed",
    contextInput: PeriodChangeContext,
  ): FiscalPeriod {
    const period = this.#requiredPeriod(periodIdInput);
    const context = this.#normalizePeriodContext(contextInput);
    if (period.status === targetStatus) return periodSnapshot(period);
    if (period.status === "hard-closed" || (period.status === "soft-closed" && targetStatus !== "hard-closed")) {
      fail("INVALID_PERIOD", "The requested period closing transition is not allowed.", {
        periodId: period.id,
        currentStatus: period.status,
        targetStatus,
      });
    }
    this.#changePeriodStatus(period, targetStatus, context);
    return periodSnapshot(period);
  }

  reopenPeriod(periodIdInput: string, contextInput: PeriodChangeContext): FiscalPeriod {
    const period = this.#requiredPeriod(periodIdInput);
    const context = this.#normalizePeriodContext(contextInput);
    if (period.status === "open") return periodSnapshot(period);
    if (period.status === "hard-closed" && context.hardCloseReopenAuthorization === null) {
      fail(
        "PERIOD_REOPEN_NOT_AUTHORIZED",
        "Reopening a hard-closed period requires an explicit authorization grant.",
        { periodId: period.id },
      );
    }
    this.#changePeriodStatus(period, "open", context);
    return periodSnapshot(period);
  }

  getJournal(journalIdInput: string): PostedJournal {
    const journalId = requireText(journalIdInput, "journalId");
    const journal = this.#journals.get(journalId);
    if (journal === undefined) {
      fail("JOURNAL_NOT_FOUND", "Journal does not exist.", { journalId });
    }
    return journal;
  }

  listJournals(): readonly PostedJournal[] {
    return Object.freeze(this.#journalOrder.map((id) => {
      const journal = this.#journals.get(id);
      if (journal === undefined) {
        fail("JOURNAL_NOT_FOUND", "Ledger journal index is internally inconsistent.", { id });
      }
      return journal;
    }));
  }

  listPeriods(): readonly FiscalPeriod[] {
    return Object.freeze(this.#periods.map(periodSnapshot));
  }

  listPeriodStatusChanges(): readonly PeriodStatusChange[] {
    return Object.freeze([...this.#periodChanges]);
  }

  reversalJournalId(originalJournalIdInput: string): string | null {
    const originalJournalId = requireText(originalJournalIdInput, "journalId");
    return this.#reversalIndex.get(originalJournalId) ?? null;
  }

  trialBalance(query: TrialBalanceQuery): TrialBalance {
    const from = businessDate(query.from);
    const to = businessDate(query.to);
    if (compareBusinessDates(from, to) > 0) {
      fail("INVALID_PERIOD", "Trial balance start date cannot be after its end date.", { from, to });
    }

    const accounts = new Map<string, TrialAccumulator>();
    for (const journalId of this.#journalOrder) {
      const journal = this.#journals.get(journalId);
      if (journal === undefined) {
        fail("JOURNAL_NOT_FOUND", "Ledger journal index is internally inconsistent.", { journalId });
      }
      if (compareBusinessDates(journal.businessDate, to) > 0) continue;

      for (const line of journal.lines) {
        const accumulator = accounts.get(line.accountId) ?? {
          openingNet: Decimal.zero(),
          periodDebit: Decimal.zero(),
          periodCredit: Decimal.zero(),
        };
        if (compareBusinessDates(journal.businessDate, from) < 0) {
          if (line.debit !== null) accumulator.openingNet = accumulator.openingNet.plus(line.debit.amount);
          if (line.credit !== null) accumulator.openingNet = accumulator.openingNet.minus(line.credit.amount);
        } else {
          if (line.debit !== null) accumulator.periodDebit = accumulator.periodDebit.plus(line.debit.amount);
          if (line.credit !== null) accumulator.periodCredit = accumulator.periodCredit.plus(line.credit.amount);
        }
        accounts.set(line.accountId, accumulator);
      }
    }

    const rows: TrialBalanceRow[] = [];
    for (const [accountId, accumulator] of [...accounts.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))) {
      if (
        accumulator.openingNet.isZero()
        && accumulator.periodDebit.isZero()
        && accumulator.periodCredit.isZero()
      ) continue;

      const [openingDebit, openingCredit] = positiveAndNegativeParts(
        accumulator.openingNet,
        this.baseCurrency,
      );
      const endingNet = accumulator.openingNet
        .plus(accumulator.periodDebit)
        .minus(accumulator.periodCredit);
      const [endingDebit, endingCredit] = positiveAndNegativeParts(endingNet, this.baseCurrency);
      rows.push(Object.freeze({
        accountId,
        openingDebit,
        openingCredit,
        periodDebit: Money.exact(accumulator.periodDebit, this.baseCurrency),
        periodCredit: Money.exact(accumulator.periodCredit, this.baseCurrency),
        endingDebit,
        endingCredit,
      }));
    }

    const zero = (): Money => Money.zero(this.baseCurrency);
    const totalsMutable = {
      openingDebit: zero(),
      openingCredit: zero(),
      periodDebit: zero(),
      periodCredit: zero(),
      endingDebit: zero(),
      endingCredit: zero(),
    };
    for (const row of rows) {
      totalsMutable.openingDebit = totalsMutable.openingDebit.plus(row.openingDebit);
      totalsMutable.openingCredit = totalsMutable.openingCredit.plus(row.openingCredit);
      totalsMutable.periodDebit = totalsMutable.periodDebit.plus(row.periodDebit);
      totalsMutable.periodCredit = totalsMutable.periodCredit.plus(row.periodCredit);
      totalsMutable.endingDebit = totalsMutable.endingDebit.plus(row.endingDebit);
      totalsMutable.endingCredit = totalsMutable.endingCredit.plus(row.endingCredit);
    }

    if (
      !totalsMutable.openingDebit.equals(totalsMutable.openingCredit)
      || !totalsMutable.periodDebit.equals(totalsMutable.periodCredit)
      || !totalsMutable.endingDebit.equals(totalsMutable.endingCredit)
    ) {
      fail("UNBALANCED_JOURNAL", "Ledger invariant violation produced an unbalanced trial balance.");
    }

    const totals: TrialBalanceTotals = Object.freeze({ ...totalsMutable });
    return Object.freeze({
      tenantId: this.tenantId,
      companyId: this.companyId,
      bookId: this.bookId,
      currency: this.baseCurrency,
      from,
      to,
      rows: Object.freeze(rows),
      totals,
    });
  }

  #normalizePeriods(inputs: readonly FiscalPeriodInput[]): InternalPeriod[] {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      fail("INVALID_PERIOD", "At least one fiscal period is required.");
    }

    const identifiers = new Set<string>();
    const periods = inputs.map((input): InternalPeriod => {
      const id = requireText(input.id, "period.id");
      if (identifiers.has(id)) {
        fail("INVALID_PERIOD", "Fiscal period identifiers must be unique.", { periodId: id });
      }
      identifiers.add(id);
      const startDate = businessDate(input.startDate);
      const endDate = businessDate(input.endDate);
      if (compareBusinessDates(startDate, endDate) > 0) {
        fail("INVALID_PERIOD", "Fiscal period start date cannot be after its end date.", {
          periodId: id,
        });
      }
      const status = input.status ?? "open";
      if (status !== "open" && status !== "soft-closed" && status !== "hard-closed") {
        fail("INVALID_PERIOD", "Fiscal period has an invalid status.", { periodId: id });
      }
      return { id, startDate, endDate, status };
    });
    periods.sort((left, right) => {
      const dateOrder = compareBusinessDates(left.startDate, right.startDate);
      return dateOrder === 0 ? left.id.localeCompare(right.id, "en") : dateOrder;
    });
    for (let index = 1; index < periods.length; index += 1) {
      const previous = periods[index - 1];
      const current = periods[index];
      if (previous === undefined || current === undefined) continue;
      if (compareBusinessDates(current.startDate, previous.endDate) <= 0) {
        fail("INVALID_PERIOD", "Fiscal periods cannot overlap.", {
          previousPeriodId: previous.id,
          periodId: current.id,
        });
      }
    }
    return periods;
  }

  #normalizePostingContext(context: PostingContext): NormalizedPostingContext {
    const idempotencyKey = requireText(context.idempotencyKey, "idempotencyKey");
    const actorId = requireText(context.actorId, "actorId");
    const softCloseOverrideReason = context.softCloseOverride === undefined
      ? null
      : requireText(context.softCloseOverride.reason, "softCloseOverride.reason", 500);
    return { idempotencyKey, actorId, softCloseOverrideReason };
  }

  #normalizePeriodContext(context: PeriodChangeContext): NormalizedPeriodChangeContext {
    if (context === null || typeof context !== "object") {
      fail("INVALID_PERIOD", "Period change context is required.");
    }
    const authorizationInput = context.hardCloseReopenAuthorization;
    let hardCloseReopenAuthorization: HardCloseReopenAuthorization | null = null;
    if (authorizationInput !== undefined) {
      if (
        authorizationInput === null
        || typeof authorizationInput !== "object"
        || authorizationInput.capability !== "period.reopen.hard-closed"
      ) {
        fail("PERIOD_REOPEN_NOT_AUTHORIZED", "Hard-close reopen authorization is invalid.");
      }
      hardCloseReopenAuthorization = Object.freeze({
        capability: "period.reopen.hard-closed" as const,
        grantId: requireText(authorizationInput.grantId, "hardCloseReopenAuthorization.grantId"),
        authorizedBy: requireText(
          authorizationInput.authorizedBy,
          "hardCloseReopenAuthorization.authorizedBy",
        ),
      });
    }
    return Object.freeze({
      actorId: requireText(context.actorId, "actorId"),
      reason: requireText(context.reason, "reason", 500),
      hardCloseReopenAuthorization,
    });
  }

  #normalizeJournal(command: PostJournalCommand, allowInternalSource: boolean): NormalizedJournal {
    if (command === null || typeof command !== "object") {
      fail("INVALID_JOURNAL", "Posting command is required.");
    }
    const postingDate = businessDate(command.businessDate);
    const source: JournalSource = Object.freeze({
      type: requireText(command.source?.type, "source.type"),
      id: requireText(command.source?.id, "source.id"),
    });
    if (!allowInternalSource && source.type === INTERNAL_SOURCE_TYPE) {
      fail("INVALID_JOURNAL", "The internal reversal source type is reserved.");
    }
    const description = optionalText(command.description, "description");
    if (!Array.isArray(command.lines) || command.lines.length < 2 || command.lines.length > MAX_JOURNAL_LINES) {
      fail("INVALID_JOURNAL", "A journal must contain between 2 and 10,000 lines.");
    }

    let totalDebit = Money.zero(this.baseCurrency);
    let totalCredit = Money.zero(this.baseCurrency);
    const lines = command.lines.map((lineInput, index): NormalizedLine => {
      if (lineInput === null || typeof lineInput !== "object") {
        fail("INVALID_JOURNAL", "Journal line must be an object.", { line: String(index + 1) });
      }
      const debitProvided = lineInput.debit !== undefined;
      const creditProvided = lineInput.credit !== undefined;
      if (debitProvided === creditProvided) {
        fail("INVALID_JOURNAL", "Each journal line must have exactly one debit or credit.", {
          line: String(index + 1),
        });
      }
      if (debitProvided && !(lineInput.debit instanceof Money)) {
        fail("INVALID_JOURNAL", "Journal line debit must be a Money value.", {
          line: String(index + 1),
        });
      }
      if (creditProvided && !(lineInput.credit instanceof Money)) {
        fail("INVALID_JOURNAL", "Journal line credit must be a Money value.", {
          line: String(index + 1),
        });
      }

      const debit = lineInput.debit ?? null;
      const credit = lineInput.credit ?? null;
      const amount = debit ?? credit;
      if (amount === null || !amount.isPositive()) {
        fail("INVALID_JOURNAL", "Journal line amount must be greater than zero.", {
          line: String(index + 1),
        });
      }
      if (!amount.currency.equals(this.baseCurrency)) {
        fail("CURRENCY_MISMATCH", "Journal line amount must use the ledger base currency.", {
          line: String(index + 1),
          expected: this.baseCurrency.code,
          actual: amount.currency.code,
        });
      }
      if (debit !== null) totalDebit = totalDebit.plus(debit);
      if (credit !== null) totalCredit = totalCredit.plus(credit);

      return Object.freeze({
        accountId: requireText(lineInput.accountId, `lines[${index}].accountId`),
        debit,
        credit,
        description: optionalText(lineInput.description, `lines[${index}].description`, 500),
        dimensions: freezeDimensions(lineInput.dimensions),
      });
    });

    if (totalDebit.isZero() || !totalDebit.equals(totalCredit)) {
      fail("UNBALANCED_JOURNAL", "A posted journal must have equal, non-zero debit and credit totals.", {
        totalDebit: totalDebit.amount.toFixed(this.baseCurrency.minorUnit),
        totalCredit: totalCredit.amount.toFixed(this.baseCurrency.minorUnit),
      });
    }

    return {
      businessDate: postingDate,
      source,
      description,
      lines: Object.freeze(lines),
      totalDebit,
      totalCredit,
    };
  }

  #postingFingerprint(
    kind: "post",
    journal: NormalizedJournal,
    context: NormalizedPostingContext,
    reversalOfJournalId: string | null,
  ): string {
    return JSON.stringify({
      kind,
      tenantId: this.tenantId,
      companyId: this.companyId,
      bookId: this.bookId,
      businessDate: journal.businessDate,
      source: journal.source,
      description: journal.description,
      lines: journal.lines.map((line) => ({
        accountId: line.accountId,
        debit: moneyFingerprint(line.debit),
        credit: moneyFingerprint(line.credit),
        description: line.description,
        dimensions: line.dimensions,
      })),
      actorId: context.actorId,
      softCloseOverrideReason: context.softCloseOverrideReason,
      reversalOfJournalId,
    });
  }

  #idempotentReplay(idempotencyKey: string, fingerprint: string): PostedJournal | null {
    const record = this.#idempotencyIndex.get(idempotencyKey);
    if (record === undefined) return null;
    if (record.fingerprint !== fingerprint) {
      fail("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different command.", {
        idempotencyKey,
      });
    }
    const journal = this.#journals.get(record.journalId);
    if (journal === undefined) {
      fail("JOURNAL_NOT_FOUND", "Idempotency index is internally inconsistent.", {
        journalId: record.journalId,
      });
    }
    return journal;
  }

  #commit(
    journal: NormalizedJournal,
    context: NormalizedPostingContext,
    fingerprint: string,
    reversalOfJournalId: string | null,
  ): PostedJournal {
    const period = this.#periodForDate(journal.businessDate);
    this.#assertPostingAllowed(period, context);

    const stagedIds = this.#stageIds([
      "journal",
      ...journal.lines.map(() => "journal-line"),
    ]);
    const id = stagedIds[0];
    if (id === undefined) {
      fail("INVALID_JOURNAL", "Journal identifier staging failed.");
    }
    const lines = Object.freeze(journal.lines.map((line, index): PostedJournalLine => Object.freeze({
      id: stagedIds[index + 1] ?? fail(
        "INVALID_JOURNAL",
        "Journal line identifier staging failed.",
      ),
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
      dimensions: line.dimensions,
    })));
    const posted: PostedJournal = Object.freeze({
      id,
      tenantId: this.tenantId,
      companyId: this.companyId,
      bookId: this.bookId,
      periodId: period.id,
      businessDate: journal.businessDate,
      source: journal.source,
      description: journal.description,
      lines,
      totalDebit: journal.totalDebit,
      totalCredit: journal.totalCredit,
      status: "posted" as const,
      postedAt: this.#nowIso(),
      postedBy: context.actorId,
      idempotencyKey: context.idempotencyKey,
      softCloseOverrideReason: context.softCloseOverrideReason,
      reversalOfJournalId,
    });

    for (const stagedId of stagedIds) this.#allocatedIds.add(stagedId);
    this.#journals.set(id, posted);
    this.#journalOrder.push(id);
    this.#sourceIndex.set(sourceKey(journal.source), id);
    this.#idempotencyIndex.set(context.idempotencyKey, Object.freeze({ fingerprint, journalId: id }));
    if (reversalOfJournalId !== null) this.#reversalIndex.set(reversalOfJournalId, id);
    return posted;
  }

  #periodForDate(date: BusinessDate): InternalPeriod {
    const period = this.#periods.find((candidate) => (
      isBusinessDateInRange(date, candidate.startDate, candidate.endDate)
    ));
    if (period === undefined) {
      fail("PERIOD_NOT_FOUND", "No configured fiscal period contains the posting date.", { date });
    }
    return period;
  }

  #assertPostingAllowed(period: InternalPeriod, context: NormalizedPostingContext): void {
    if (period.status === "hard-closed") {
      fail("PERIOD_LOCKED", "The selected fiscal period is hard-closed.", {
        periodId: period.id,
      });
    }
    if (period.status === "soft-closed" && context.softCloseOverrideReason === null) {
      fail("SOFT_CLOSE_OVERRIDE_REQUIRED", "Posting to a soft-closed period requires a documented override.", {
        periodId: period.id,
      });
    }
  }

  #requiredPeriod(periodIdInput: string): InternalPeriod {
    const periodId = requireText(periodIdInput, "periodId");
    const period = this.#periodsById.get(periodId);
    if (period === undefined) {
      fail("PERIOD_NOT_FOUND", "Fiscal period does not exist.", { periodId });
    }
    return period;
  }

  #changePeriodStatus(
    period: InternalPeriod,
    newStatus: PeriodStatus,
    context: NormalizedPeriodChangeContext,
  ): void {
    const previousStatus = period.status;
    const [id] = this.#stageIds(["period-status-change"]);
    if (id === undefined) {
      fail("INVALID_PERIOD", "Period status change identifier staging failed.");
    }
    const change: PeriodStatusChange = Object.freeze({
      id,
      periodId: period.id,
      previousStatus,
      newStatus,
      actorId: context.actorId,
      reason: context.reason,
      authorizationGrantId: context.hardCloseReopenAuthorization?.grantId ?? null,
      authorizedBy: context.hardCloseReopenAuthorization?.authorizedBy ?? null,
      changedAt: this.#nowIso(),
    });
    this.#allocatedIds.add(id);
    period.status = newStatus;
    this.#periodChanges.push(change);
  }

  #stageIds(kinds: readonly string[]): readonly string[] {
    const staged = new Set<string>();
    const ids = kinds.map((kind) => {
      const id = requireText(this.#idGenerator(), `${kind}.id`);
      if (this.#allocatedIds.has(id) || staged.has(id)) {
        fail("DUPLICATE_IDENTIFIER", "Identifier generator returned a duplicate identifier.", {
          kind,
          id,
        });
      }
      staged.add(id);
      return id;
    });
    return Object.freeze(ids);
  }

  #nowIso(): string {
    const now = this.#clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      fail("INVALID_JOURNAL", "Clock returned an invalid timestamp.");
    }
    return now.toISOString();
  }
}

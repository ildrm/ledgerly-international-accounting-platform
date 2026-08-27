export type AccountingErrorCode =
  | "INVALID_DECIMAL"
  | "DECIMAL_LIMIT_EXCEEDED"
  | "DIVISION_BY_ZERO"
  | "INVALID_CURRENCY"
  | "CURRENCY_MISMATCH"
  | "MONEY_SCALE_MISMATCH"
  | "INVALID_BUSINESS_DATE"
  | "INVALID_PERIOD"
  | "PERIOD_NOT_FOUND"
  | "PERIOD_LOCKED"
  | "PERIOD_REOPEN_NOT_AUTHORIZED"
  | "SOFT_CLOSE_OVERRIDE_REQUIRED"
  | "INVALID_JOURNAL"
  | "UNBALANCED_JOURNAL"
  | "IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_SOURCE"
  | "JOURNAL_NOT_FOUND"
  | "ALREADY_REVERSED"
  | "REVERSAL_NOT_ALLOWED"
  | "DUPLICATE_IDENTIFIER"
  | "INVALID_EXCHANGE_RATE"
  | "EXCHANGE_RATE_NOT_FOUND"
  | "EXCHANGE_RATE_PAIR_MISMATCH"
  | "INVALID_FX_EXPOSURE"
  | "INVALID_ACCOUNT"
  | "INVALID_REPORT_QUERY"
  | "REPORT_SOURCE_INVALID"
  | "UNBALANCED_REPORT";

export class AccountingError extends Error {
  readonly code: AccountingErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(
    code: AccountingErrorCode,
    message: string,
    details: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "AccountingError";
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function fail(
  code: AccountingErrorCode,
  message: string,
  details: Readonly<Record<string, string>> = {},
): never {
  throw new AccountingError(code, message, details);
}

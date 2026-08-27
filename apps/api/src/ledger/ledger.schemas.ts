import { z } from 'zod';

const uuid = z.uuid();
const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/).max(52);
const signedDecimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/).max(53);
const businessDate = z.iso.date();

export const createAccountSchema = z.object({
  companyId: uuid, bookId: uuid, parentId: uuid.nullable().optional(),
  code: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(200),
  type: z.enum(['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE','CONTRA']),
  normalBalance: z.enum(['D','C']), isControl: z.boolean().default(false), allowPosting: z.boolean().default(true),
});

export const journalLineSchema = z.object({
  accountId: uuid, description: z.string().trim().max(500).optional(),
  debit: decimal.default('0'), credit: decimal.default('0'),
  transactionAmount: signedDecimal.optional(), transactionCurrency: z.string().length(3).regex(/^[A-Z]{3}$/),
  exchangeRate: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/).refine((value) => value !== '0'),
  exchangeRateId: uuid.optional(),
  dimensions: z.record(z.string().max(80), z.string().max(160)).default({}),
}).superRefine((line, context) => {
  const debitPositive = line.debit !== '0' && !/^0\.0+$/u.test(line.debit);
  const creditPositive = line.credit !== '0' && !/^0\.0+$/u.test(line.credit);
  if (debitPositive === creditPositive) context.addIssue({ code: 'custom', message: 'Exactly one of debit or credit must be positive', path: ['debit'] });
});

export const createJournalSchema = z.object({
  companyId: uuid, bookId: uuid, businessDate, description: z.string().trim().max(500).optional(),
  sourceType: z.string().trim().min(1).max(80), sourceId: z.string().trim().min(1).max(160),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/), lines: z.array(journalLineSchema).min(2).max(500),
});

export const softCloseOverrideSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export const postJournalSchema = z.object({
  softCloseOverride: softCloseOverrideSchema.optional(),
}).default({});
export const reverseJournalSchema = z.object({
  businessDate,
  reason: z.string().trim().min(3).max(500),
  softCloseOverride: softCloseOverrideSchema.optional(),
});
export const createExchangeRateSchema = z.object({
  companyId: uuid,
  fromCurrency: z.string().length(3).regex(/^[A-Z]{3}$/),
  toCurrency: z.string().length(3).regex(/^[A-Z]{3}$/),
  rate: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/).refine((value) => value !== '0'),
  rateDate: businessDate,
  sourceKind: z.enum(['MANUAL','IMPORTED','OFFICIAL','MARKET','HISTORICAL','CONSOLIDATION']),
  provider: z.string().trim().min(1).max(160),
  sourceReference: z.string().trim().min(1).max(240),
}).refine((value) => value.fromCurrency !== value.toCurrency, {
  path: ['toCurrency'], message: 'Currency pair must contain two different currencies',
});
export const exchangeRateQuerySchema = z.object({
  companyId: uuid,
  fromCurrency: z.string().length(3).regex(/^[A-Z]{3}$/),
  toCurrency: z.string().length(3).regex(/^[A-Z]{3}$/),
  onOrBefore: businessDate,
});
export const trialBalanceQuerySchema = z.object({ companyId: uuid, bookId: uuid, from: businessDate, to: businessDate }).refine((value) => value.from <= value.to, { path: ['to'], message: 'to must be on or after from' });

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateJournalInput = z.infer<typeof createJournalSchema>;
export type CreateExchangeRateInput = z.infer<typeof createExchangeRateSchema>;
export type ExchangeRateQuery = z.infer<typeof exchangeRateQuerySchema>;
export type PostJournalInput = z.infer<typeof postJournalSchema>;
export type ReverseJournalInput = z.infer<typeof reverseJournalSchema>;
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;

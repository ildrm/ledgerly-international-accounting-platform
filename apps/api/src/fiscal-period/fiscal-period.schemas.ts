import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';

const uuid = z.uuid();
const businessDate = z.iso.date();
const containsControlCharacter = (value: string): boolean => Array.from(value).some((character) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
});
const safeReason = z.string().trim().min(3).max(500).refine(
  (value) => !containsControlCharacter(value),
  'Reason contains control characters',
);

export const periodStatuses = ['OPEN', 'SOFT_CLOSED', 'HARD_CLOSED'] as const;
export const coreCloseCheckKeys = [
  'bank_reconciliation',
  'accounts_receivable',
  'accounts_payable',
  'inventory',
  'depreciation',
  'payroll',
  'accruals',
  'tax',
  'unposted_documents',
] as const;
export const attestableCloseCheckKeys = coreCloseCheckKeys.filter(
  (key): key is Exclude<(typeof coreCloseCheckKeys)[number], 'unposted_documents'> => key !== 'unposted_documents',
);

export const fiscalPeriodScopeQuerySchema = z.object({
  companyId: uuid,
  bookId: uuid,
});

export const createFiscalPeriodSchema = fiscalPeriodScopeQuerySchema.extend({
  name: z.string().trim().min(2).max(80),
  startDate: businessDate,
  endDate: businessDate,
}).refine((period) => period.startDate <= period.endDate, {
  path: ['endDate'],
  message: 'Fiscal period end must be on or after its start',
});

export const transitionFiscalPeriodSchema = z.object({
  targetStatus: z.enum(periodStatuses),
  reason: safeReason,
});

const customCheckKey = z.string().regex(/^custom\.[a-z][a-z0-9_.-]{0,72}$/u);
export const recordCloseEvidenceSchema = z.object({
  checkKey: z.union([z.enum(attestableCloseCheckKeys), customCheckKey]),
  status: z.enum(['ATTESTED', 'BLOCKED', 'NOT_APPLICABLE']),
  reason: safeReason,
  sourceReference: z.string().trim().min(1).max(240).optional(),
});

export type FiscalPeriodScopeQuery = z.infer<typeof fiscalPeriodScopeQuerySchema>;
export type CreateFiscalPeriodInput = z.infer<typeof createFiscalPeriodSchema>;
export type TransitionFiscalPeriodInput = z.infer<typeof transitionFiscalPeriodSchema>;
export type RecordCloseEvidenceInput = z.infer<typeof recordCloseEvidenceSchema>;

export const fiscalPeriodOpenApiSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'companyId', 'bookId', 'name', 'startDate', 'endDate', 'status', 'closedAt', 'closedBy', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    companyId: { type: 'string', format: 'uuid' },
    bookId: { type: 'string', format: 'uuid' },
    name: { type: 'string', maxLength: 80 },
    startDate: { type: 'string', format: 'date' },
    endDate: { type: 'string', format: 'date' },
    status: { type: 'string', enum: [...periodStatuses] },
    closedAt: { type: 'string', format: 'date-time', nullable: true },
    closedBy: { type: 'string', format: 'uuid', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const createFiscalPeriodOpenApiSchema: SchemaObject = {
  type: 'object',
  required: ['companyId', 'bookId', 'name', 'startDate', 'endDate'],
  properties: {
    companyId: { type: 'string', format: 'uuid' },
    bookId: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 2, maxLength: 80 },
    startDate: { type: 'string', format: 'date' },
    endDate: { type: 'string', format: 'date' },
  },
};

export const transitionFiscalPeriodOpenApiSchema: SchemaObject = {
  type: 'object',
  required: ['targetStatus', 'reason'],
  properties: {
    targetStatus: { type: 'string', enum: [...periodStatuses] },
    reason: { type: 'string', minLength: 3, maxLength: 500 },
  },
};

export const recordCloseEvidenceOpenApiSchema: SchemaObject = {
  type: 'object',
  required: ['checkKey', 'status', 'reason'],
  properties: {
    checkKey: {
      type: 'string',
      description: 'A known close control key or an extension key prefixed with custom.',
      examples: ['bank_reconciliation', 'custom.local_statutory_filing'],
    },
    status: { type: 'string', enum: ['ATTESTED', 'BLOCKED', 'NOT_APPLICABLE'] },
    reason: { type: 'string', minLength: 3, maxLength: 500 },
    sourceReference: { type: 'string', minLength: 1, maxLength: 240 },
  },
};

export const closeReadinessOpenApiSchema: SchemaObject = {
  type: 'object',
  required: ['periodId', 'periodStatus', 'canHardClose', 'summary', 'checks'],
  properties: {
    periodId: { type: 'string', format: 'uuid' },
    periodStatus: { type: 'string', enum: [...periodStatuses] },
    canHardClose: { type: 'boolean' },
    summary: {
      type: 'object',
      required: ['systemPassed', 'attested', 'blocked', 'pending', 'unavailable'],
      properties: {
        systemPassed: { type: 'integer', minimum: 0 },
        attested: { type: 'integer', minimum: 0 },
        blocked: { type: 'integer', minimum: 0 },
        pending: { type: 'integer', minimum: 0 },
        unavailable: { type: 'integer', minimum: 0 },
      },
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'availability', 'state', 'automated', 'blocking', 'evidence', 'drillDown'],
        properties: {
          key: { type: 'string' },
          availability: { type: 'string', enum: ['AVAILABLE', 'UNAVAILABLE', 'EXTERNAL'] },
          state: { type: 'string', enum: ['PASS', 'BLOCKED', 'PENDING', 'ATTESTED', 'NOT_APPLICABLE'] },
          automated: { type: 'boolean' },
          blocking: { type: 'boolean' },
          unavailableReason: { type: 'string', nullable: true },
          evidence: { type: 'object', nullable: true, additionalProperties: true },
          drillDown: { type: 'object', nullable: true, additionalProperties: true },
        },
      },
    },
  },
};

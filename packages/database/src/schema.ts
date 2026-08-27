import { sql } from 'drizzle-orm';
import {
  bigint, boolean, char, check, date, foreignKey, index, inet, integer, jsonb,
  numeric, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar,
} from 'drizzle-orm/pg-core';

export const iam = pgSchema('iam');
export const core = pgSchema('core');
export const ledger = pgSchema('ledger');
export const audit = pgSchema('audit');
export const integration = pgSchema('integration');

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const users = iam.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 254 }).notNull(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [
  unique('uq_users_email').on(table.email),
  check('ck_users_status', sql`${table.status} in ('ACTIVE','SUSPENDED','DELETED')`),
]);

export const sessions = iam.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: char('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  userAgent: varchar('user_agent', { length: 512 }),
  ipAddress: inet('ip_address'),
  createdAt: createdAt(),
}, (table) => [unique('uq_sessions_token_hash').on(table.tokenHash), index('idx_sessions_user_active').on(table.userId, table.expiresAt)]);

export const tenants = core.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
  defaultLocale: varchar('default_locale', { length: 32 }).notNull().default('en-US'),
  timeZone: varchar('time_zone', { length: 100 }).notNull().default('UTC'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique('uq_tenants_slug').on(table.slug), check('ck_tenants_status', sql`${table.status} in ('ACTIVE','SUSPENDED','DELETED')`)]);

export const memberships = core.table('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  role: varchar('role', { length: 32 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
  capabilities: text('capabilities').array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [
  unique('uq_memberships_tenant_user').on(table.tenantId, table.userId),
  unique('uq_memberships_tenant_id').on(table.tenantId, table.id),
  index('idx_memberships_user_status').on(table.userId, table.status),
  check('ck_memberships_role', sql`${table.role} in ('OWNER','ADMIN','ACCOUNTANT','BOOKKEEPER','AUDITOR')`),
  check('ck_memberships_status', sql`${table.status} in ('INVITED','ACTIVE','SUSPENDED','REVOKED')`),
]);

export const companies = core.table('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 200 }).notNull(),
  legalName: varchar('legal_name', { length: 240 }),
  countryCode: char('country_code', { length: 2 }).notNull(),
  baseCurrency: char('base_currency', { length: 3 }).notNull(),
  timeZone: varchar('time_zone', { length: 100 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [
  unique('uq_companies_tenant_id').on(table.tenantId, table.id),
  index('idx_companies_tenant_status').on(table.tenantId, table.status),
  check('ck_companies_currency', sql`${table.baseCurrency} ~ '^[A-Z]{3}$'`),
  check('ck_companies_country', sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
]);

export const userLocalizationPreferences = core.table('user_localization_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  uiLocale: varchar('ui_locale', { length: 32 }).notNull(),
  formatLocale: varchar('format_locale', { length: 32 }).notNull(),
  timeZone: varchar('time_zone', { length: 100 }).notNull(),
  calendar: varchar('calendar', { length: 16 }).notNull(),
  numberingSystem: varchar('numbering_system', { length: 16 }).notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: updatedAt(),
}, (table) => [
  check('ck_user_locale_calendar', sql`${table.calendar} in ('gregory','persian')`),
  check('ck_user_locale_numbering', sql`${table.numberingSystem} in ('latn','arab','arabext')`),
  check('ck_user_locale_revision', sql`${table.revision} > 0`),
]);

export const books = ledger.table('books', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull(), companyId: uuid('company_id').notNull(),
  code: varchar('code', { length: 32 }).notNull(), name: varchar('name', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 32 }).notNull().default('STATUTORY'), baseCurrency: char('base_currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE'), createdAt: createdAt(),
}, (table) => [
  foreignKey({ name: 'fk_books_company_tenant', columns: [table.tenantId, table.companyId], foreignColumns: [companies.tenantId, companies.id] }),
  unique('uq_books_tenant_id').on(table.tenantId, table.id), unique('uq_books_company_code').on(table.tenantId, table.companyId, table.code),
]);

export const fiscalPeriods = ledger.table('fiscal_periods', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull(), companyId: uuid('company_id').notNull(), bookId: uuid('book_id').notNull(),
  name: varchar('name', { length: 80 }).notNull(), startDate: date('start_date').notNull(), endDate: date('end_date').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('OPEN'), closedAt: timestamp('closed_at', { withTimezone: true }), closedBy: uuid('closed_by').references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [
  foreignKey({ name: 'fk_periods_book_tenant', columns: [table.tenantId, table.bookId], foreignColumns: [books.tenantId, books.id] }),
  foreignKey({ name: 'fk_periods_company_tenant', columns: [table.tenantId, table.companyId], foreignColumns: [companies.tenantId, companies.id] }),
  unique('uq_periods_tenant_id').on(table.tenantId, table.id), unique('uq_periods_book_dates').on(table.tenantId, table.bookId, table.startDate, table.endDate),
  check('ck_period_dates', sql`${table.endDate} >= ${table.startDate}`), check('ck_period_status', sql`${table.status} in ('OPEN','SOFT_CLOSED','HARD_CLOSED')`),
]);

export const fiscalPeriodCloseEvidence = ledger.table('fiscal_period_close_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(), companyId: uuid('company_id').notNull(),
  bookId: uuid('book_id').notNull(), periodId: uuid('period_id').notNull(),
  checkKey: varchar('check_key', { length: 80 }).notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  reason: varchar('reason', { length: 500 }).notNull(),
  sourceReference: varchar('source_reference', { length: 240 }),
  recordedBy: uuid('recorded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, (table) => [
  foreignKey({
    name: 'fk_period_close_evidence_period',
    columns: [table.tenantId, table.companyId, table.bookId, table.periodId],
    foreignColumns: [fiscalPeriods.tenantId, fiscalPeriods.companyId, fiscalPeriods.bookId, fiscalPeriods.id],
  }),
  index('idx_period_close_evidence_latest').on(table.tenantId, table.periodId, table.checkKey, table.createdAt, table.id),
]);

export const fiscalPeriodStatusChanges = ledger.table('fiscal_period_status_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(), companyId: uuid('company_id').notNull(),
  bookId: uuid('book_id').notNull(), periodId: uuid('period_id').notNull(),
  previousStatus: varchar('previous_status', { length: 16 }).notNull(),
  newStatus: varchar('new_status', { length: 16 }).notNull(),
  reason: varchar('reason', { length: 500 }).notNull(),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
  authorizationCapability: varchar('authorization_capability', { length: 80 }),
  authorizationMembershipId: uuid('authorization_membership_id'),
  correlationId: uuid('correlation_id'),
  readinessSnapshot: jsonb('readiness_snapshot').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    name: 'fk_period_status_change_period',
    columns: [table.tenantId, table.companyId, table.bookId, table.periodId],
    foreignColumns: [fiscalPeriods.tenantId, fiscalPeriods.companyId, fiscalPeriods.bookId, fiscalPeriods.id],
  }),
  foreignKey({
    name: 'fk_period_status_change_membership',
    columns: [table.tenantId, table.authorizationMembershipId],
    foreignColumns: [memberships.tenantId, memberships.id],
  }),
  index('idx_period_status_changes_period').on(table.tenantId, table.periodId, table.occurredAt, table.id),
]);

export const accounts = ledger.table('accounts', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull(), companyId: uuid('company_id').notNull(), bookId: uuid('book_id').notNull(),
  parentId: uuid('parent_id'), code: varchar('code', { length: 64 }).notNull(), name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 24 }).notNull(), normalBalance: char('normal_balance', { length: 1 }).notNull(),
  isControl: boolean('is_control').notNull().default(false), allowPosting: boolean('allow_posting').notNull().default(true), status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [
  foreignKey({ name: 'fk_accounts_book_tenant', columns: [table.tenantId, table.bookId], foreignColumns: [books.tenantId, books.id] }),
  foreignKey({ name: 'fk_accounts_parent_tenant', columns: [table.tenantId, table.parentId], foreignColumns: [table.tenantId, table.id] }),
  unique('uq_accounts_tenant_id').on(table.tenantId, table.id), unique('uq_accounts_book_code').on(table.tenantId, table.bookId, table.code),
  check('ck_accounts_type', sql`${table.type} in ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE','CONTRA')`), check('ck_accounts_normal', sql`${table.normalBalance} in ('D','C')`),
]);

export const journals = ledger.table('journals', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull(), companyId: uuid('company_id').notNull(), bookId: uuid('book_id').notNull(), periodId: uuid('period_id'),
  documentNumber: varchar('document_number', { length: 80 }), businessDate: date('business_date').notNull(), status: varchar('status', { length: 16 }).notNull().default('DRAFT'),
  description: varchar('description', { length: 500 }), sourceType: varchar('source_type', { length: 80 }).notNull(), sourceId: varchar('source_id', { length: 160 }).notNull(),
  currency: char('currency', { length: 3 }).notNull(), version: integer('version').notNull().default(1), createdBy: uuid('created_by').notNull().references(() => users.id),
  postedBy: uuid('posted_by').references(() => users.id), postedAt: timestamp('posted_at', { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [
  foreignKey({ name: 'fk_journals_company_tenant', columns: [table.tenantId, table.companyId], foreignColumns: [companies.tenantId, companies.id] }),
  foreignKey({ name: 'fk_journals_book_tenant', columns: [table.tenantId, table.bookId], foreignColumns: [books.tenantId, books.id] }),
  foreignKey({ name: 'fk_journals_period_tenant', columns: [table.tenantId, table.periodId], foreignColumns: [fiscalPeriods.tenantId, fiscalPeriods.id] }),
  unique('uq_journals_tenant_id').on(table.tenantId, table.id), unique('uq_journals_source').on(table.tenantId, table.bookId, table.sourceType, table.sourceId),
  unique('uq_journals_document_number').on(table.tenantId, table.bookId, table.documentNumber), index('idx_journals_book_date').on(table.tenantId, table.bookId, table.businessDate),
  check('ck_journals_status', sql`${table.status} in ('DRAFT','APPROVED','POSTED')`), check('ck_journals_version', sql`${table.version} > 0`),
]);

export const journalLines = ledger.table('journal_lines', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull(), journalId: uuid('journal_id').notNull(), lineNumber: integer('line_number').notNull(), accountId: uuid('account_id').notNull(),
  description: varchar('description', { length: 500 }), debit: numeric('debit', { precision: 38, scale: 12 }).notNull().default('0'), credit: numeric('credit', { precision: 38, scale: 12 }).notNull().default('0'),
  transactionAmount: numeric('transaction_amount', { precision: 38, scale: 12 }).notNull(), transactionCurrency: char('transaction_currency', { length: 3 }).notNull(),
  exchangeRate: numeric('exchange_rate', { precision: 38, scale: 18 }).notNull().default('1'), dimensions: jsonb('dimensions').$type<Record<string, string>>().notNull().default({}), createdAt: createdAt(),
}, (table) => [
  foreignKey({ name: 'fk_lines_journal_tenant', columns: [table.tenantId, table.journalId], foreignColumns: [journals.tenantId, journals.id] }).onDelete('cascade'),
  foreignKey({ name: 'fk_lines_account_tenant', columns: [table.tenantId, table.accountId], foreignColumns: [accounts.tenantId, accounts.id] }),
  unique('uq_lines_journal_number').on(table.tenantId, table.journalId, table.lineNumber), index('idx_lines_account').on(table.tenantId, table.accountId),
  check('ck_lines_amounts', sql`${table.debit} >= 0 and ${table.credit} >= 0 and ((${table.debit} > 0 and ${table.credit} = 0) or (${table.credit} > 0 and ${table.debit} = 0))`),
  check('ck_lines_rate', sql`${table.exchangeRate} > 0`),
]);

export const numberSequences = ledger.table('number_sequences', {
  tenantId: uuid('tenant_id').notNull(), companyId: uuid('company_id').notNull(), bookId: uuid('book_id').notNull(), sequenceType: varchar('sequence_type', { length: 40 }).notNull(), fiscalYear: integer('fiscal_year').notNull(), prefix: varchar('prefix', { length: 32 }).notNull(), nextValue: bigint('next_value', { mode: 'bigint' }).notNull().default(1n), updatedAt: updatedAt(),
}, (table) => [primaryKey({ name: 'pk_number_sequences', columns: [table.tenantId, table.bookId, table.sequenceType, table.fiscalYear] }), check('ck_sequences_next', sql`${table.nextValue} > 0`)]);

export const journalReversals = ledger.table('journal_reversals', {
  tenantId: uuid('tenant_id').notNull(), originalJournalId: uuid('original_journal_id').notNull(), reversalJournalId: uuid('reversal_journal_id').notNull(), reason: varchar('reason', { length: 500 }).notNull(), createdBy: uuid('created_by').notNull().references(() => users.id), createdAt: createdAt(),
}, (table) => [
  primaryKey({ name: 'pk_journal_reversals', columns: [table.tenantId, table.originalJournalId] }),
  foreignKey({ name: 'fk_reversal_original', columns: [table.tenantId, table.originalJournalId], foreignColumns: [journals.tenantId, journals.id] }),
  foreignKey({ name: 'fk_reversal_new', columns: [table.tenantId, table.reversalJournalId], foreignColumns: [journals.tenantId, journals.id] }),
  unique('uq_reversal_new').on(table.tenantId, table.reversalJournalId),
]);

export const auditEvents = audit.table('events', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(), tenantId: uuid('tenant_id'), companyId: uuid('company_id'), actorUserId: uuid('actor_user_id').references(() => users.id),
  eventType: varchar('event_type', { length: 120 }).notNull(), entityType: varchar('entity_type', { length: 80 }).notNull(), entityId: uuid('entity_id'), correlationId: uuid('correlation_id'),
  sourceIp: inet('source_ip'), metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('idx_audit_tenant_time').on(table.tenantId, table.occurredAt), index('idx_audit_entity').on(table.tenantId, table.entityType, table.entityId)]);

export const outboxEvents = integration.table('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(), tenantId: uuid('tenant_id').notNull(), aggregateType: varchar('aggregate_type', { length: 80 }).notNull(), aggregateId: uuid('aggregate_id').notNull(), eventType: varchar('event_type', { length: 120 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(), availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  attempts: integer('attempts').notNull().default(0), dispatchedAt: timestamp('dispatched_at', { withTimezone: true }), lastError: text('last_error'),
}, (table) => [index('idx_outbox_pending').on(table.dispatchedAt, table.availableAt), check('ck_outbox_attempts', sql`${table.attempts} >= 0`)]);

export const idempotencyKeys = integration.table('idempotency_keys', {
  tenantId: uuid('tenant_id').notNull(), scope: varchar('scope', { length: 80 }).notNull(), key: varchar('key', { length: 160 }).notNull(), requestHash: char('request_hash', { length: 64 }).notNull(),
  responseStatus: integer('response_status'), responseBody: jsonb('response_body').$type<Record<string, unknown>>(), resourceId: uuid('resource_id'), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: createdAt(),
}, (table) => [primaryKey({ name: 'pk_idempotency_keys', columns: [table.tenantId, table.scope, table.key] }), index('idx_idempotency_expiry').on(table.expiresAt)]);

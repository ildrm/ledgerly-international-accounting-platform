CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS ledger;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS integration;

CREATE OR REPLACE FUNCTION core.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION core.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE TABLE iam.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE iam.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent varchar(512),
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user_active ON iam.sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE core.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  default_locale varchar(32) NOT NULL DEFAULT 'en-US',
  time_zone varchar(100) NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  role varchar(32) NOT NULL CHECK (role IN ('OWNER','ADMIN','ACCOUNTANT','BOOKKEEPER','AUDITOR')),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_memberships_tenant_user UNIQUE (tenant_id, user_id),
  CONSTRAINT uq_memberships_tenant_id UNIQUE (tenant_id, id)
);
CREATE INDEX idx_memberships_user_status ON core.memberships(user_id, status);

CREATE TABLE core.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  name varchar(200) NOT NULL,
  legal_name varchar(240),
  country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  base_currency char(3) NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  time_zone varchar(100) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_companies_tenant_id UNIQUE (tenant_id, id)
);
CREATE INDEX idx_companies_tenant_status ON core.companies(tenant_id, status);

CREATE TABLE core.user_localization_preferences (
  user_id uuid PRIMARY KEY REFERENCES iam.users(id) ON DELETE CASCADE,
  ui_locale varchar(32) NOT NULL,
  format_locale varchar(32) NOT NULL,
  time_zone varchar(100) NOT NULL,
  calendar varchar(16) NOT NULL CHECK (calendar IN ('gregory','persian')),
  numbering_system varchar(16) NOT NULL CHECK (numbering_system IN ('latn','arab','arabext')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  code varchar(32) NOT NULL,
  name varchar(120) NOT NULL,
  kind varchar(32) NOT NULL DEFAULT 'STATUTORY' CHECK (kind IN ('STATUTORY','MANAGEMENT','TAX','IFRS','OTHER')),
  base_currency char(3) NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_books_company_tenant FOREIGN KEY (tenant_id, company_id) REFERENCES core.companies(tenant_id, id),
  CONSTRAINT uq_books_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_books_company_code UNIQUE (tenant_id, company_id, code)
);

CREATE TABLE ledger.fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  book_id uuid NOT NULL,
  name varchar(80) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SOFT_CLOSED','HARD_CLOSED')),
  closed_at timestamptz,
  closed_by uuid REFERENCES iam.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_periods_book_tenant FOREIGN KEY (tenant_id, book_id) REFERENCES ledger.books(tenant_id, id),
  CONSTRAINT fk_periods_company_tenant FOREIGN KEY (tenant_id, company_id) REFERENCES core.companies(tenant_id, id),
  CONSTRAINT uq_periods_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_periods_book_dates UNIQUE (tenant_id, book_id, start_date, end_date)
);
CREATE INDEX idx_periods_book_date ON ledger.fiscal_periods(tenant_id, book_id, start_date, end_date);

CREATE TABLE ledger.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  book_id uuid NOT NULL,
  parent_id uuid,
  code varchar(64) NOT NULL,
  name varchar(200) NOT NULL,
  type varchar(24) NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE','CONTRA')),
  normal_balance char(1) NOT NULL CHECK (normal_balance IN ('D','C')),
  is_control boolean NOT NULL DEFAULT false,
  allow_posting boolean NOT NULL DEFAULT true,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_accounts_book_tenant FOREIGN KEY (tenant_id, book_id) REFERENCES ledger.books(tenant_id, id),
  CONSTRAINT uq_accounts_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_accounts_parent_tenant FOREIGN KEY (tenant_id, parent_id) REFERENCES ledger.accounts(tenant_id, id),
  CONSTRAINT uq_accounts_book_code UNIQUE (tenant_id, book_id, code)
);
CREATE INDEX idx_accounts_company ON ledger.accounts(tenant_id, company_id, status);

CREATE TABLE ledger.journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  book_id uuid NOT NULL,
  period_id uuid,
  document_number varchar(80),
  business_date date NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','POSTED')),
  description varchar(500),
  source_type varchar(80) NOT NULL,
  source_id varchar(160) NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES iam.users(id),
  posted_by uuid REFERENCES iam.users(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_journals_company_tenant FOREIGN KEY (tenant_id, company_id) REFERENCES core.companies(tenant_id, id),
  CONSTRAINT fk_journals_book_tenant FOREIGN KEY (tenant_id, book_id) REFERENCES ledger.books(tenant_id, id),
  CONSTRAINT fk_journals_period_tenant FOREIGN KEY (tenant_id, period_id) REFERENCES ledger.fiscal_periods(tenant_id, id),
  CONSTRAINT uq_journals_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_journals_source UNIQUE (tenant_id, book_id, source_type, source_id)
);
CREATE INDEX idx_journals_book_date ON ledger.journals(tenant_id, book_id, business_date, id);
CREATE INDEX idx_journals_posted ON ledger.journals(tenant_id, book_id, business_date) WHERE status = 'POSTED';
CREATE UNIQUE INDEX uq_journals_document_number ON ledger.journals(tenant_id, book_id, document_number) WHERE document_number IS NOT NULL;

CREATE TABLE ledger.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  journal_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  account_id uuid NOT NULL,
  description varchar(500),
  debit numeric(38,12) NOT NULL DEFAULT 0,
  credit numeric(38,12) NOT NULL DEFAULT 0,
  transaction_amount numeric(38,12) NOT NULL,
  transaction_currency char(3) NOT NULL CHECK (transaction_currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(38,18) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_lines_amounts CHECK (debit >= 0 AND credit >= 0 AND ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))),
  CONSTRAINT fk_lines_journal_tenant FOREIGN KEY (tenant_id, journal_id) REFERENCES ledger.journals(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_lines_account_tenant FOREIGN KEY (tenant_id, account_id) REFERENCES ledger.accounts(tenant_id, id),
  CONSTRAINT uq_lines_journal_number UNIQUE (tenant_id, journal_id, line_number)
);
CREATE INDEX idx_lines_account ON ledger.journal_lines(tenant_id, account_id, journal_id);

CREATE TABLE ledger.number_sequences (
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  book_id uuid NOT NULL,
  sequence_type varchar(40) NOT NULL,
  fiscal_year integer NOT NULL,
  prefix varchar(32) NOT NULL,
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, book_id, sequence_type, fiscal_year)
);

CREATE TABLE ledger.journal_reversals (
  tenant_id uuid NOT NULL,
  original_journal_id uuid NOT NULL,
  reversal_journal_id uuid NOT NULL,
  reason varchar(500) NOT NULL,
  created_by uuid NOT NULL REFERENCES iam.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, original_journal_id),
  CONSTRAINT fk_reversal_original FOREIGN KEY (tenant_id, original_journal_id) REFERENCES ledger.journals(tenant_id, id),
  CONSTRAINT fk_reversal_new FOREIGN KEY (tenant_id, reversal_journal_id) REFERENCES ledger.journals(tenant_id, id),
  CONSTRAINT uq_reversal_new UNIQUE (tenant_id, reversal_journal_id)
);

CREATE TABLE audit.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid,
  company_id uuid,
  actor_user_id uuid REFERENCES iam.users(id),
  event_type varchar(120) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id uuid,
  correlation_id uuid,
  source_ip inet,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON audit.events(tenant_id, occurred_at DESC);
CREATE INDEX idx_audit_entity ON audit.events(tenant_id, entity_type, entity_id);

CREATE TABLE integration.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  aggregate_type varchar(80) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(120) NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  dispatched_at timestamptz,
  last_error text
);
CREATE INDEX idx_outbox_pending ON integration.outbox_events(available_at, id) WHERE dispatched_at IS NULL;

CREATE TABLE integration.idempotency_keys (
  tenant_id uuid NOT NULL,
  scope varchar(80) NOT NULL,
  key varchar(160) NOT NULL,
  request_hash char(64) NOT NULL,
  response_status integer,
  response_body jsonb,
  resource_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope, key)
);
CREATE INDEX idx_idempotency_expiry ON integration.idempotency_keys(expires_at);

CREATE OR REPLACE FUNCTION core.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER users_touch BEFORE UPDATE ON iam.users FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER tenants_touch BEFORE UPDATE ON core.tenants FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER memberships_touch BEFORE UPDATE ON core.memberships FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER companies_touch BEFORE UPDATE ON core.companies FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER preferences_touch BEFORE UPDATE ON core.user_localization_preferences FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER periods_touch BEFORE UPDATE ON ledger.fiscal_periods FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER accounts_touch BEFORE UPDATE ON ledger.accounts FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER journals_touch BEFORE UPDATE ON ledger.journals FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();

CREATE OR REPLACE FUNCTION ledger.protect_posted_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'POSTED' THEN RAISE EXCEPTION 'POSTED_JOURNAL_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' THEN RAISE EXCEPTION 'POSTED_JOURNAL_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER protect_posted_journal BEFORE UPDATE OR DELETE ON ledger.journals FOR EACH ROW EXECUTE FUNCTION ledger.protect_posted_journal();

CREATE OR REPLACE FUNCTION ledger.protect_posted_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status varchar(16); parent_id uuid;
BEGIN
  parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_id ELSE NEW.journal_id END;
  SELECT status INTO parent_status FROM ledger.journals WHERE id = parent_id;
  IF parent_status = 'POSTED' THEN RAISE EXCEPTION 'POSTED_JOURNAL_LINES_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER protect_posted_lines BEFORE INSERT OR UPDATE OR DELETE ON ledger.journal_lines FOR EACH ROW EXECUTE FUNCTION ledger.protect_posted_lines();

CREATE OR REPLACE FUNCTION ledger.validate_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total_debit numeric(38,12); total_credit numeric(38,12); line_count integer; matched_period uuid;
BEGIN
  IF NEW.status = 'POSTED' AND OLD.status <> 'POSTED' THEN
    SELECT count(*), coalesce(sum(debit),0), coalesce(sum(credit),0)
      INTO line_count, total_debit, total_credit
      FROM ledger.journal_lines WHERE tenant_id = NEW.tenant_id AND journal_id = NEW.id;
    IF line_count < 2 OR total_debit <= 0 OR total_debit <> total_credit THEN
      RAISE EXCEPTION 'UNBALANCED_JOURNAL' USING ERRCODE = '23514';
    END IF;
    SELECT id INTO matched_period FROM ledger.fiscal_periods
      WHERE tenant_id = NEW.tenant_id AND company_id = NEW.company_id AND book_id = NEW.book_id
        AND NEW.business_date BETWEEN start_date AND end_date AND status = 'OPEN'
      ORDER BY start_date DESC LIMIT 1 FOR UPDATE;
    IF matched_period IS NULL THEN RAISE EXCEPTION 'ACCOUNTING_PERIOD_CLOSED_OR_MISSING' USING ERRCODE = '23514'; END IF;
    IF NEW.period_id IS NOT NULL AND NEW.period_id <> matched_period THEN RAISE EXCEPTION 'JOURNAL_PERIOD_MISMATCH' USING ERRCODE = '23514'; END IF;
    IF NEW.document_number IS NULL OR NEW.posted_by IS NULL OR NEW.posted_at IS NULL THEN RAISE EXCEPTION 'POSTING_METADATA_REQUIRED' USING ERRCODE = '23514'; END IF;
    NEW.period_id := matched_period;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_journal_posting BEFORE UPDATE OF status ON ledger.journals FOR EACH ROW EXECUTE FUNCTION ledger.validate_posting();

CREATE OR REPLACE FUNCTION audit.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit.events FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

ALTER TABLE core.tenants ENABLE ROW LEVEL SECURITY; ALTER TABLE core.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE core.memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE core.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE core.companies ENABLE ROW LEVEL SECURITY; ALTER TABLE core.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE core.user_localization_preferences ENABLE ROW LEVEL SECURITY; ALTER TABLE core.user_localization_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.books ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger.books FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.fiscal_periods ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger.fiscal_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.journals ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger.journals FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.journal_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger.journal_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.number_sequences ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger.number_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.journal_reversals ENABLE ROW LEVEL SECURITY; ALTER TABLE ledger.journal_reversals FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY; ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;
ALTER TABLE integration.outbox_events ENABLE ROW LEVEL SECURITY; ALTER TABLE integration.outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE integration.idempotency_keys ENABLE ROW LEVEL SECURITY; ALTER TABLE integration.idempotency_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_scope ON core.tenants USING (id = core.current_tenant_id()) WITH CHECK (id = core.current_tenant_id());
CREATE POLICY membership_scope ON core.memberships USING (tenant_id = core.current_tenant_id() OR user_id = core.current_user_id()) WITH CHECK (tenant_id = core.current_tenant_id() AND (user_id = core.current_user_id() OR core.current_user_id() IS NOT NULL));
CREATE POLICY company_scope ON core.companies USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY preference_scope ON core.user_localization_preferences USING (user_id = core.current_user_id()) WITH CHECK (user_id = core.current_user_id());
CREATE POLICY book_scope ON ledger.books USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY period_scope ON ledger.fiscal_periods USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY account_scope ON ledger.accounts USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY journal_scope ON ledger.journals USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY line_scope ON ledger.journal_lines USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY sequence_scope ON ledger.number_sequences USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY reversal_scope ON ledger.journal_reversals USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY audit_scope ON audit.events USING (tenant_id = core.current_tenant_id() OR (tenant_id IS NULL AND actor_user_id = core.current_user_id())) WITH CHECK (tenant_id = core.current_tenant_id() OR (tenant_id IS NULL AND actor_user_id = core.current_user_id()));
CREATE POLICY outbox_scope ON integration.outbox_events USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());
CREATE POLICY idempotency_scope ON integration.idempotency_keys USING (tenant_id = core.current_tenant_id()) WITH CHECK (tenant_id = core.current_tenant_id());

GRANT USAGE ON SCHEMA iam, core, ledger, audit, integration TO ledgerly_runtime;
GRANT SELECT, INSERT, UPDATE ON iam.users, iam.sessions TO ledgerly_runtime;
GRANT DELETE ON iam.sessions TO ledgerly_runtime;
GRANT SELECT, INSERT, UPDATE ON core.tenants, core.memberships, core.companies, core.user_localization_preferences TO ledgerly_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.books, ledger.fiscal_periods, ledger.accounts, ledger.journals, ledger.journal_lines, ledger.number_sequences, ledger.journal_reversals TO ledgerly_runtime;
GRANT SELECT, INSERT ON audit.events TO ledgerly_runtime;
GRANT SELECT, INSERT, UPDATE ON integration.outbox_events, integration.idempotency_keys TO ledgerly_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO ledgerly_runtime;

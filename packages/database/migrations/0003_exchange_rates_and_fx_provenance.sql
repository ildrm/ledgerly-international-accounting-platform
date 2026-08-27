-- Versioned exchange rates are append-only financial evidence.  A journal line
-- stores the selected rate identifier as well as the numeric rate so historical
-- postings never change when a newer market observation arrives.

CREATE TABLE ledger.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  from_currency char(3) NOT NULL CHECK (from_currency ~ '^[A-Z]{3}$'),
  to_currency char(3) NOT NULL CHECK (to_currency ~ '^[A-Z]{3}$'),
  rate numeric(38,18) NOT NULL CHECK (rate > 0),
  rate_date date NOT NULL,
  source_kind varchar(24) NOT NULL CHECK (source_kind IN ('MANUAL','IMPORTED','OFFICIAL','MARKET','HISTORICAL','CONSOLIDATION')),
  provider varchar(160) NOT NULL CHECK (btrim(provider) <> ''),
  source_reference varchar(240) NOT NULL CHECK (btrim(source_reference) <> ''),
  created_by uuid NOT NULL REFERENCES iam.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_exchange_rate_pair CHECK (from_currency <> to_currency),
  CONSTRAINT uq_exchange_rates_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_exchange_rates_company_tenant
    FOREIGN KEY (tenant_id, company_id) REFERENCES core.companies (tenant_id, id),
  CONSTRAINT uq_exchange_rate_observation
    UNIQUE (tenant_id, company_id, from_currency, to_currency, rate_date, source_kind, provider, source_reference)
);

CREATE INDEX idx_exchange_rates_historical_lookup
  ON ledger.exchange_rates (tenant_id, company_id, from_currency, to_currency, rate_date DESC, created_at DESC);

ALTER TABLE ledger.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.exchange_rates FORCE ROW LEVEL SECURITY;

CREATE POLICY exchange_rate_scope ON ledger.exchange_rates
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

GRANT SELECT, INSERT ON ledger.exchange_rates TO ledgerly_runtime;

CREATE OR REPLACE FUNCTION ledger.reject_exchange_rate_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EXCHANGE_RATE_APPEND_ONLY' USING ERRCODE = '42501';
  RETURN NULL;
END $$;

CREATE TRIGGER exchange_rates_append_only
BEFORE UPDATE OR DELETE ON ledger.exchange_rates
FOR EACH ROW EXECUTE FUNCTION ledger.reject_exchange_rate_mutation();

ALTER TABLE ledger.journal_lines
  ADD COLUMN exchange_rate_id uuid,
  ADD CONSTRAINT fk_journal_lines_exchange_rate
    FOREIGN KEY (tenant_id, exchange_rate_id) REFERENCES ledger.exchange_rates (tenant_id, id);

CREATE OR REPLACE FUNCTION ledger.validate_journal_base_currency() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected_base_currency char(3);
BEGIN
  SELECT base_currency INTO expected_base_currency
    FROM ledger.books
   WHERE tenant_id = NEW.tenant_id
     AND company_id = NEW.company_id
     AND id = NEW.book_id;
  IF expected_base_currency IS NULL THEN
    RAISE EXCEPTION 'COMPANY_OR_BOOK_NOT_ACTIVE' USING ERRCODE = '23514';
  END IF;
  IF NEW.currency <> expected_base_currency THEN
    RAISE EXCEPTION 'JOURNAL_CURRENCY_MUST_EQUAL_BOOK_BASE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER validate_journal_base_currency
BEFORE INSERT OR UPDATE ON ledger.journals
FOR EACH ROW EXECUTE FUNCTION ledger.validate_journal_base_currency();

CREATE OR REPLACE FUNCTION ledger.validate_journal_line_exchange_rate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  journal_company_id uuid;
  journal_business_date date;
  base_currency char(3);
  selected_rate ledger.exchange_rates%ROWTYPE;
  expected_base_amount numeric(38,12);
  recorded_base_amount numeric(38,12);
BEGIN
  SELECT journal.company_id, journal.business_date, book.base_currency
    INTO journal_company_id, journal_business_date, base_currency
    FROM ledger.journals journal
    JOIN ledger.books book
      ON book.tenant_id = journal.tenant_id
     AND book.company_id = journal.company_id
     AND book.id = journal.book_id
   WHERE journal.tenant_id = NEW.tenant_id
     AND journal.id = NEW.journal_id;

  IF journal_company_id IS NULL THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF NEW.transaction_currency = base_currency THEN
    IF NEW.exchange_rate <> 1 OR NEW.exchange_rate_id IS NOT NULL THEN
      RAISE EXCEPTION 'BASE_CURRENCY_LINE_REQUIRES_UNIT_RATE' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.exchange_rate_id IS NULL THEN
      RAISE EXCEPTION 'FOREIGN_CURRENCY_LINE_REQUIRES_RATE_PROVENANCE' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO selected_rate
      FROM ledger.exchange_rates
     WHERE tenant_id = NEW.tenant_id
       AND company_id = journal_company_id
       AND id = NEW.exchange_rate_id;
    IF selected_rate.id IS NULL
       OR selected_rate.from_currency <> NEW.transaction_currency
       OR selected_rate.to_currency <> base_currency
       OR selected_rate.rate <> NEW.exchange_rate
       OR selected_rate.rate_date > journal_business_date THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_PROVENANCE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  expected_base_amount := round(abs(NEW.transaction_amount) * NEW.exchange_rate, 12);
  recorded_base_amount := round(NEW.debit + NEW.credit, 12);
  IF expected_base_amount <> recorded_base_amount
     OR (NEW.debit > 0 AND NEW.transaction_amount <= 0)
     OR (NEW.credit > 0 AND NEW.transaction_amount >= 0) THEN
    RAISE EXCEPTION 'TRANSACTION_AND_BASE_AMOUNT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER validate_journal_line_exchange_rate
BEFORE INSERT OR UPDATE ON ledger.journal_lines
FOR EACH ROW EXECUTE FUNCTION ledger.validate_journal_line_exchange_rate();

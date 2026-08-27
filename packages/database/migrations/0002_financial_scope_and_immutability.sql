-- Close invariant bypasses found by adversarial review. These constraints and triggers
-- deliberately protect the ledger even if an application query is later implemented incorrectly.

CREATE OR REPLACE FUNCTION ledger.protect_posted_lines() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_parent_status varchar(16);
  new_parent_status varchar(16);
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO old_parent_status
      FROM ledger.journals
     WHERE tenant_id = OLD.tenant_id AND id = OLD.journal_id;
    IF old_parent_status = 'POSTED' THEN
      RAISE EXCEPTION 'POSTED_JOURNAL_LINES_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status INTO new_parent_status
      FROM ledger.journals
     WHERE tenant_id = NEW.tenant_id AND id = NEW.journal_id;
    IF new_parent_status IS NULL THEN
      RAISE EXCEPTION 'JOURNAL_NOT_FOUND' USING ERRCODE = '23503';
    END IF;
    IF new_parent_status = 'POSTED' THEN
      RAISE EXCEPTION 'POSTED_JOURNAL_LINES_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION ledger.reject_posted_journal_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'POSTED' THEN
    RAISE EXCEPTION 'POSTED_JOURNAL_MUST_USE_POSTING_TRANSITION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER reject_posted_journal_insert
BEFORE INSERT ON ledger.journals
FOR EACH ROW EXECUTE FUNCTION ledger.reject_posted_journal_insert();

-- Tenant/company/book identifiers define the ownership boundary of financial
-- records.  They are immutable even while a record is still a draft: allowing a
-- parent to move after a child was validated would silently invalidate the
-- composite foreign-key and RLS assumptions below.
CREATE OR REPLACE FUNCTION ledger.protect_book_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'BOOK_SCOPE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_book_scope
BEFORE UPDATE ON ledger.books
FOR EACH ROW EXECUTE FUNCTION ledger.protect_book_scope();

CREATE OR REPLACE FUNCTION ledger.protect_period_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.book_id IS DISTINCT FROM OLD.book_id
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_SCOPE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_period_scope
BEFORE UPDATE ON ledger.fiscal_periods
FOR EACH ROW EXECUTE FUNCTION ledger.protect_period_scope();

CREATE OR REPLACE FUNCTION ledger.protect_account_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.book_id IS DISTINCT FROM OLD.book_id THEN
    RAISE EXCEPTION 'ACCOUNT_SCOPE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_account_scope
BEFORE UPDATE ON ledger.accounts
FOR EACH ROW EXECUTE FUNCTION ledger.protect_account_scope();

CREATE OR REPLACE FUNCTION ledger.protect_journal_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.book_id IS DISTINCT FROM OLD.book_id THEN
    RAISE EXCEPTION 'JOURNAL_SCOPE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_journal_scope
BEFORE UPDATE ON ledger.journals
FOR EACH ROW EXECUTE FUNCTION ledger.protect_journal_scope();

CREATE OR REPLACE FUNCTION ledger.validate_posting() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  total_debit numeric(38,12);
  total_credit numeric(38,12);
  line_count integer;
  invalid_account_count integer;
  matched_period uuid;
BEGIN
  IF NEW.status = 'POSTED' AND OLD.status <> 'POSTED' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM core.companies company
        JOIN ledger.books book
          ON book.tenant_id = company.tenant_id
         AND book.company_id = company.id
       WHERE company.tenant_id = NEW.tenant_id
         AND company.id = NEW.company_id
         AND company.status = 'ACTIVE'
         AND book.id = NEW.book_id
         AND book.status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'COMPANY_OR_BOOK_NOT_ACTIVE' USING ERRCODE = '23514';
    END IF;

    SELECT count(*), coalesce(sum(line.debit),0), coalesce(sum(line.credit),0)
      INTO line_count, total_debit, total_credit
      FROM ledger.journal_lines line
     WHERE line.tenant_id = NEW.tenant_id AND line.journal_id = NEW.id;
    IF line_count < 2 OR total_debit <= 0 OR total_debit <> total_credit THEN
      RAISE EXCEPTION 'UNBALANCED_JOURNAL' USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO invalid_account_count
      FROM ledger.journal_lines line
      LEFT JOIN ledger.accounts account
        ON account.tenant_id = line.tenant_id AND account.id = line.account_id
     WHERE line.tenant_id = NEW.tenant_id
       AND line.journal_id = NEW.id
       AND (
         account.id IS NULL OR account.status <> 'ACTIVE' OR NOT account.allow_posting
         OR account.company_id <> NEW.company_id OR account.book_id <> NEW.book_id
       );
    IF invalid_account_count > 0 THEN
      RAISE EXCEPTION 'JOURNAL_HAS_INACTIVE_OR_OUT_OF_SCOPE_ACCOUNT' USING ERRCODE = '23514';
    END IF;

    SELECT id INTO matched_period
      FROM ledger.fiscal_periods
     WHERE tenant_id = NEW.tenant_id
       AND company_id = NEW.company_id
       AND book_id = NEW.book_id
       AND NEW.business_date BETWEEN start_date AND end_date
       AND status = 'OPEN'
     ORDER BY start_date DESC LIMIT 1 FOR UPDATE;
    IF matched_period IS NULL THEN
      RAISE EXCEPTION 'ACCOUNTING_PERIOD_CLOSED_OR_MISSING' USING ERRCODE = '23514';
    END IF;
    IF NEW.period_id IS NOT NULL AND NEW.period_id <> matched_period THEN
      RAISE EXCEPTION 'JOURNAL_PERIOD_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF NEW.document_number IS NULL OR NEW.posted_by IS NULL OR NEW.posted_at IS NULL THEN
      RAISE EXCEPTION 'POSTING_METADATA_REQUIRED' USING ERRCODE = '23514';
    END IF;
    NEW.period_id := matched_period;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE ledger.books
  ADD CONSTRAINT uq_books_tenant_company_id UNIQUE (tenant_id, company_id, id);

ALTER TABLE ledger.fiscal_periods
  ADD CONSTRAINT uq_periods_tenant_company_book_id UNIQUE (tenant_id, company_id, book_id, id),
  ADD CONSTRAINT fk_periods_company_book
    FOREIGN KEY (tenant_id, company_id, book_id)
    REFERENCES ledger.books (tenant_id, company_id, id);

ALTER TABLE ledger.accounts
  ADD CONSTRAINT uq_accounts_tenant_company_book_id UNIQUE (tenant_id, company_id, book_id, id),
  ADD CONSTRAINT fk_accounts_company_book
    FOREIGN KEY (tenant_id, company_id, book_id)
    REFERENCES ledger.books (tenant_id, company_id, id),
  ADD CONSTRAINT fk_accounts_parent_same_book
    FOREIGN KEY (tenant_id, company_id, book_id, parent_id)
    REFERENCES ledger.accounts (tenant_id, company_id, book_id, id);

ALTER TABLE ledger.journals
  ADD CONSTRAINT uq_journals_tenant_company_book_id UNIQUE (tenant_id, company_id, book_id, id),
  ADD CONSTRAINT fk_journals_company_book
    FOREIGN KEY (tenant_id, company_id, book_id)
    REFERENCES ledger.books (tenant_id, company_id, id),
  ADD CONSTRAINT fk_journals_period_same_book
    FOREIGN KEY (tenant_id, company_id, book_id, period_id)
    REFERENCES ledger.fiscal_periods (tenant_id, company_id, book_id, id);

ALTER TABLE ledger.number_sequences
  ADD CONSTRAINT fk_sequences_company_book
    FOREIGN KEY (tenant_id, company_id, book_id)
    REFERENCES ledger.books (tenant_id, company_id, id);

CREATE OR REPLACE FUNCTION ledger.validate_journal_line_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  journal_company_id uuid;
  journal_book_id uuid;
  account_company_id uuid;
  account_book_id uuid;
BEGIN
  SELECT company_id, book_id INTO journal_company_id, journal_book_id
    FROM ledger.journals
   WHERE tenant_id = NEW.tenant_id AND id = NEW.journal_id;
  SELECT company_id, book_id INTO account_company_id, account_book_id
    FROM ledger.accounts
   WHERE tenant_id = NEW.tenant_id AND id = NEW.account_id;

  IF journal_company_id IS NULL OR account_company_id IS NULL THEN
    RAISE EXCEPTION 'JOURNAL_OR_ACCOUNT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF journal_company_id <> account_company_id OR journal_book_id <> account_book_id THEN
    RAISE EXCEPTION 'JOURNAL_ACCOUNT_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER validate_journal_line_scope
BEFORE INSERT OR UPDATE ON ledger.journal_lines
FOR EACH ROW EXECUTE FUNCTION ledger.validate_journal_line_scope();

CREATE OR REPLACE FUNCTION ledger.validate_reversal_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  original_company_id uuid;
  original_book_id uuid;
  original_status varchar(16);
  reversal_company_id uuid;
  reversal_book_id uuid;
  reversal_status varchar(16);
BEGIN
  IF NEW.original_journal_id = NEW.reversal_journal_id THEN
    RAISE EXCEPTION 'JOURNAL_CANNOT_REVERSE_ITSELF' USING ERRCODE = '23514';
  END IF;
  SELECT company_id, book_id, status
    INTO original_company_id, original_book_id, original_status
    FROM ledger.journals
   WHERE tenant_id = NEW.tenant_id AND id = NEW.original_journal_id;
  SELECT company_id, book_id, status
    INTO reversal_company_id, reversal_book_id, reversal_status
    FROM ledger.journals
   WHERE tenant_id = NEW.tenant_id AND id = NEW.reversal_journal_id;
  IF original_status <> 'POSTED' OR reversal_status <> 'POSTED'
     OR original_company_id <> reversal_company_id OR original_book_id <> reversal_book_id THEN
    RAISE EXCEPTION 'INVALID_JOURNAL_REVERSAL_SCOPE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER validate_reversal_scope
BEFORE INSERT ON ledger.journal_reversals
FOR EACH ROW EXECUTE FUNCTION ledger.validate_reversal_scope();

CREATE OR REPLACE FUNCTION ledger.reject_reversal_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'JOURNAL_REVERSAL_APPEND_ONLY' USING ERRCODE = '42501';
  RETURN NULL;
END $$;

CREATE TRIGGER journal_reversals_append_only
BEFORE UPDATE OR DELETE ON ledger.journal_reversals
FOR EACH ROW EXECUTE FUNCTION ledger.reject_reversal_mutation();

-- Until role-management is exposed through narrow privileged routines, a
-- runtime connection may create only the caller's own membership.  This closes
-- the prior predicate where any non-null user context could create an OWNER for
-- an arbitrary user.
DROP POLICY membership_scope ON core.memberships;
CREATE POLICY membership_scope ON core.memberships
  USING (user_id = core.current_user_id())
  WITH CHECK (
    tenant_id = core.current_tenant_id()
    AND user_id = core.current_user_id()
  );

CREATE OR REPLACE FUNCTION core.has_active_tenant_membership(candidate_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM core.memberships membership
     WHERE membership.tenant_id = candidate_tenant_id
       AND membership.user_id = core.current_user_id()
       AND membership.status = 'ACTIVE'
  )
$$;

DROP POLICY company_scope ON core.companies;
CREATE POLICY company_scope ON core.companies
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY book_scope ON ledger.books;
CREATE POLICY book_scope ON ledger.books
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY period_scope ON ledger.fiscal_periods;
CREATE POLICY period_scope ON ledger.fiscal_periods
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY account_scope ON ledger.accounts;
CREATE POLICY account_scope ON ledger.accounts
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY journal_scope ON ledger.journals;
CREATE POLICY journal_scope ON ledger.journals
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY line_scope ON ledger.journal_lines;
CREATE POLICY line_scope ON ledger.journal_lines
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY sequence_scope ON ledger.number_sequences;
CREATE POLICY sequence_scope ON ledger.number_sequences
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY reversal_scope ON ledger.journal_reversals;
CREATE POLICY reversal_scope ON ledger.journal_reversals
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY audit_scope ON audit.events;
CREATE POLICY audit_scope ON audit.events
  USING (
    (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
    OR (tenant_id IS NULL AND actor_user_id = core.current_user_id())
  )
  WITH CHECK (
    (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
    OR (tenant_id IS NULL AND actor_user_id = core.current_user_id())
  );

DROP POLICY outbox_scope ON integration.outbox_events;
CREATE POLICY outbox_scope ON integration.outbox_events
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

DROP POLICY idempotency_scope ON integration.idempotency_keys;
CREATE POLICY idempotency_scope ON integration.idempotency_keys
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

REVOKE UPDATE ON core.memberships FROM ledgerly_runtime;
REVOKE DELETE ON ledger.books, ledger.fiscal_periods, ledger.accounts,
  ledger.journals, ledger.journal_lines, ledger.number_sequences,
  ledger.journal_reversals FROM ledgerly_runtime;

ALTER TABLE audit.events
  ADD CONSTRAINT ck_audit_company_requires_tenant CHECK (company_id IS NULL OR tenant_id IS NOT NULL),
  ADD CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES core.tenants (id),
  ADD CONSTRAINT fk_audit_company_tenant
    FOREIGN KEY (tenant_id, company_id) REFERENCES core.companies (tenant_id, id);

ALTER TABLE integration.outbox_events
  ADD CONSTRAINT fk_outbox_tenant FOREIGN KEY (tenant_id) REFERENCES core.tenants (id);

ALTER TABLE integration.idempotency_keys
  ADD CONSTRAINT fk_idempotency_tenant FOREIGN KEY (tenant_id) REFERENCES core.tenants (id);

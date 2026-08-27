CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE core.memberships
  ADD COLUMN capabilities text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE core.memberships
  ADD CONSTRAINT ck_membership_capabilities_known CHECK (
    capabilities <@ ARRAY[
      'period.create',
      'period.close',
      'period.post.soft-closed',
      'period.reopen.hard-closed'
    ]::text[]
  );

UPDATE core.memberships
   SET capabilities = CASE role
     WHEN 'OWNER' THEN ARRAY[
       'period.create',
       'period.close',
       'period.post.soft-closed',
       'period.reopen.hard-closed'
     ]::text[]
     WHEN 'ADMIN' THEN ARRAY[
       'period.create',
       'period.close',
       'period.post.soft-closed'
     ]::text[]
     WHEN 'ACCOUNTANT' THEN ARRAY[
       'period.create',
       'period.close',
       'period.post.soft-closed'
     ]::text[]
     ELSE '{}'::text[]
   END;

CREATE OR REPLACE FUNCTION core.has_capability(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM core.memberships membership
     WHERE membership.tenant_id = core.current_tenant_id()
       AND membership.user_id = core.current_user_id()
       AND membership.status = 'ACTIVE'
       AND membership.capabilities @> ARRAY[candidate]::text[]
  )
$$;

ALTER TABLE ledger.fiscal_periods
  ADD CONSTRAINT ex_fiscal_periods_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    book_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );

ALTER TABLE ledger.fiscal_periods
  ADD CONSTRAINT ck_fiscal_period_close_metadata CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND closed_by IS NULL)
    OR (status IN ('SOFT_CLOSED', 'HARD_CLOSED') AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
  );

CREATE TABLE ledger.fiscal_period_close_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  book_id uuid NOT NULL,
  period_id uuid NOT NULL,
  check_key varchar(80) NOT NULL CHECK (check_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  status varchar(24) NOT NULL CHECK (status IN ('ATTESTED','BLOCKED','NOT_APPLICABLE')),
  reason varchar(500) NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  source_reference varchar(240),
  recorded_by uuid NOT NULL REFERENCES iam.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_period_close_evidence_period
    FOREIGN KEY (tenant_id, company_id, book_id, period_id)
    REFERENCES ledger.fiscal_periods (tenant_id, company_id, book_id, id)
);
CREATE INDEX idx_period_close_evidence_latest
  ON ledger.fiscal_period_close_evidence (tenant_id, period_id, check_key, created_at DESC, id DESC);

CREATE TABLE ledger.fiscal_period_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  book_id uuid NOT NULL,
  period_id uuid NOT NULL,
  previous_status varchar(16) NOT NULL CHECK (previous_status IN ('OPEN','SOFT_CLOSED','HARD_CLOSED')),
  new_status varchar(16) NOT NULL CHECK (new_status IN ('OPEN','SOFT_CLOSED','HARD_CLOSED')),
  reason varchar(500) NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  actor_user_id uuid NOT NULL REFERENCES iam.users(id),
  authorization_capability varchar(80),
  authorization_membership_id uuid,
  correlation_id uuid,
  readiness_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_period_status_change_period
    FOREIGN KEY (tenant_id, company_id, book_id, period_id)
    REFERENCES ledger.fiscal_periods (tenant_id, company_id, book_id, id),
  CONSTRAINT fk_period_status_change_membership
    FOREIGN KEY (tenant_id, authorization_membership_id)
    REFERENCES core.memberships (tenant_id, id),
  CONSTRAINT ck_hard_reopen_authorization CHECK (
    NOT (previous_status = 'HARD_CLOSED' AND new_status = 'OPEN')
    OR (
      authorization_capability = 'period.reopen.hard-closed'
      AND authorization_membership_id IS NOT NULL
    )
  )
);
CREATE INDEX idx_period_status_changes_period
  ON ledger.fiscal_period_status_changes (tenant_id, period_id, occurred_at DESC, id DESC);

CREATE OR REPLACE FUNCTION ledger.reject_fiscal_period_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FISCAL_PERIOD_AUDIT_APPEND_ONLY' USING ERRCODE = '42501';
END
$$;

CREATE TRIGGER fiscal_period_close_evidence_append_only
BEFORE UPDATE OR DELETE ON ledger.fiscal_period_close_evidence
FOR EACH ROW EXECUTE FUNCTION ledger.reject_fiscal_period_audit_mutation();

CREATE TRIGGER fiscal_period_status_changes_append_only
BEFORE UPDATE OR DELETE ON ledger.fiscal_period_status_changes
FOR EACH ROW EXECUTE FUNCTION ledger.reject_fiscal_period_audit_mutation();

ALTER TABLE ledger.fiscal_period_close_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.fiscal_period_close_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger.fiscal_period_status_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.fiscal_period_status_changes FORCE ROW LEVEL SECURITY;

CREATE POLICY fiscal_period_close_evidence_scope ON ledger.fiscal_period_close_evidence
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

CREATE POLICY fiscal_period_status_changes_scope ON ledger.fiscal_period_status_changes
  USING (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id))
  WITH CHECK (tenant_id = core.current_tenant_id() AND core.has_active_tenant_membership(tenant_id));

CREATE OR REPLACE FUNCTION ledger.create_fiscal_period(
  p_tenant_id uuid,
  p_period_id uuid,
  p_company_id uuid,
  p_book_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_correlation_id uuid
)
RETURNS SETOF ledger.fiscal_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, ledger, audit, integration
AS $$
DECLARE
  created_period ledger.fiscal_periods%ROWTYPE;
BEGIN
  IF p_tenant_id IS DISTINCT FROM core.current_tenant_id()
     OR core.current_user_id() IS NULL
     OR NOT core.has_active_tenant_membership(p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT core.has_capability('period.create') THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_CAPABILITY_REQUIRED:period.create' USING ERRCODE = '42501';
  END IF;
  IF p_period_id IS NULL
     OR p_company_id IS NULL
     OR p_book_id IS NULL
     OR p_correlation_id IS NULL
     OR p_name IS NULL
     OR length(btrim(p_name)) NOT BETWEEN 2 AND 80
     OR p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'INVALID_FISCAL_PERIOD_VALUE' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
    FROM core.companies company
    JOIN ledger.books book
      ON book.tenant_id = company.tenant_id
     AND book.company_id = company.id
   WHERE company.tenant_id = p_tenant_id
     AND company.id = p_company_id
     AND company.status = 'ACTIVE'
     AND book.id = p_book_id
     AND book.status = 'ACTIVE'
   FOR SHARE OF company, book;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANY_OR_BOOK_NOT_ACTIVE' USING ERRCODE = '23514';
  END IF;

  INSERT INTO ledger.fiscal_periods (
    id, tenant_id, company_id, book_id, name, start_date, end_date, status
  ) VALUES (
    p_period_id, p_tenant_id, p_company_id, p_book_id, btrim(p_name),
    p_start_date, p_end_date, 'OPEN'
  ) RETURNING * INTO created_period;

  INSERT INTO audit.events (
    tenant_id, company_id, actor_user_id, event_type, entity_type, entity_id,
    correlation_id, metadata
  ) VALUES (
    p_tenant_id, p_company_id, core.current_user_id(),
    'LEDGER.FISCAL_PERIOD_CREATED', 'FISCAL_PERIOD', created_period.id,
    p_correlation_id,
    jsonb_build_object(
      'bookId', p_book_id,
      'startDate', p_start_date,
      'endDate', p_end_date
    )
  );

  INSERT INTO integration.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload
  ) VALUES (
    p_tenant_id, 'FISCAL_PERIOD', created_period.id, 'FiscalPeriodCreated',
    jsonb_build_object(
      'periodId', created_period.id,
      'companyId', p_company_id,
      'bookId', p_book_id
    )
  );

  RETURN NEXT created_period;
END
$$;

CREATE OR REPLACE FUNCTION ledger.record_fiscal_period_close_evidence(
  p_tenant_id uuid,
  p_period_id uuid,
  p_check_key text,
  p_status text,
  p_reason text,
  p_source_reference text,
  p_correlation_id uuid
)
RETURNS SETOF ledger.fiscal_period_close_evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, ledger, audit
AS $$
DECLARE
  selected_period ledger.fiscal_periods%ROWTYPE;
  evidence ledger.fiscal_period_close_evidence%ROWTYPE;
BEGIN
  IF p_tenant_id IS DISTINCT FROM core.current_tenant_id()
     OR core.current_user_id() IS NULL
     OR NOT core.has_active_tenant_membership(p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT core.has_capability('period.close') THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_CAPABILITY_REQUIRED:period.close' USING ERRCODE = '42501';
  END IF;
  IF p_check_key = 'unposted_documents' THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_CHECK_IS_SYSTEM_MANAGED' USING ERRCODE = '23514';
  END IF;
  IF p_correlation_id IS NULL
     OR p_check_key IS NULL
     OR p_status IS NULL
     OR p_reason IS NULL
     OR p_check_key !~ '^[a-z][a-z0-9_.-]{1,79}$'
     OR p_status NOT IN ('ATTESTED','BLOCKED','NOT_APPLICABLE')
     OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500
     OR (p_source_reference IS NOT NULL AND length(p_source_reference) > 240) THEN
    RAISE EXCEPTION 'INVALID_FISCAL_PERIOD_EVIDENCE' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO selected_period
    FROM ledger.fiscal_periods
   WHERE tenant_id = p_tenant_id AND id = p_period_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO ledger.fiscal_period_close_evidence (
    tenant_id, company_id, book_id, period_id, check_key, status,
    reason, source_reference, recorded_by
  ) VALUES (
    p_tenant_id, selected_period.company_id, selected_period.book_id, selected_period.id,
    p_check_key, p_status, btrim(p_reason), nullif(btrim(p_source_reference), ''), core.current_user_id()
  ) RETURNING * INTO evidence;

  INSERT INTO audit.events (
    tenant_id, company_id, actor_user_id, event_type, entity_type, entity_id,
    correlation_id, metadata
  ) VALUES (
    p_tenant_id, selected_period.company_id, core.current_user_id(),
    'LEDGER.FISCAL_PERIOD_CLOSE_EVIDENCE_RECORDED', 'FISCAL_PERIOD', selected_period.id,
    p_correlation_id,
    jsonb_build_object(
      'evidenceId', evidence.id,
      'checkKey', evidence.check_key,
      'status', evidence.status,
      'reason', evidence.reason,
      'sourceReference', evidence.source_reference
    )
  );

  RETURN NEXT evidence;
END
$$;

CREATE OR REPLACE FUNCTION ledger.transition_fiscal_period(
  p_tenant_id uuid,
  p_period_id uuid,
  p_target_status text,
  p_reason text,
  p_correlation_id uuid
)
RETURNS SETOF ledger.fiscal_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, ledger, audit, integration
AS $$
DECLARE
  selected_period ledger.fiscal_periods%ROWTYPE;
  changed_period ledger.fiscal_periods%ROWTYPE;
  membership_id uuid;
  unposted_document_count integer := 0;
  pending_checks text[] := '{}'::text[];
  blocked_checks text[] := '{}'::text[];
  evidence_ids uuid[] := '{}'::uuid[];
  authorization_capability text := NULL;
  authorization_membership_id uuid := NULL;
  readiness_snapshot jsonb := '{}'::jsonb;
  required_external_checks constant text[] := ARRAY[
    'bank_reconciliation',
    'accounts_receivable',
    'accounts_payable',
    'inventory',
    'depreciation',
    'payroll',
    'accruals',
    'tax'
  ]::text[];
BEGIN
  IF p_tenant_id IS DISTINCT FROM core.current_tenant_id()
     OR core.current_user_id() IS NULL
     OR NOT core.has_active_tenant_membership(p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_correlation_id IS NULL
     OR p_target_status IS NULL
     OR p_reason IS NULL
     OR p_target_status NOT IN ('OPEN','SOFT_CLOSED','HARD_CLOSED')
     OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'INVALID_FISCAL_PERIOD_TRANSITION' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO selected_period
    FROM ledger.fiscal_periods
   WHERE tenant_id = p_tenant_id AND id = p_period_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF selected_period.status = p_target_status THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_STATUS_UNCHANGED' USING ERRCODE = '23505';
  END IF;
  IF NOT (
    (selected_period.status = 'OPEN' AND p_target_status = 'SOFT_CLOSED')
    OR (selected_period.status = 'SOFT_CLOSED' AND p_target_status IN ('OPEN','HARD_CLOSED'))
    OR (selected_period.status = 'HARD_CLOSED' AND p_target_status = 'OPEN')
  ) THEN
    RAISE EXCEPTION 'INVALID_FISCAL_PERIOD_TRANSITION' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO membership_id
    FROM core.memberships
   WHERE tenant_id = p_tenant_id
     AND user_id = core.current_user_id()
     AND status = 'ACTIVE'
   LIMIT 1;

  IF selected_period.status = 'HARD_CLOSED' AND p_target_status = 'OPEN' THEN
    IF NOT core.has_capability('period.reopen.hard-closed') THEN
      RAISE EXCEPTION 'FISCAL_PERIOD_HARD_CLOSE_REOPEN_NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
    authorization_capability := 'period.reopen.hard-closed';
    authorization_membership_id := membership_id;
  ELSE
    IF NOT core.has_capability('period.close') THEN
      RAISE EXCEPTION 'FISCAL_PERIOD_CAPABILITY_REQUIRED:period.close' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF selected_period.status = 'SOFT_CLOSED' AND p_target_status = 'HARD_CLOSED' THEN
    SELECT count(*)::integer INTO unposted_document_count
      FROM ledger.journals journal
     WHERE journal.tenant_id = p_tenant_id
       AND journal.company_id = selected_period.company_id
       AND journal.book_id = selected_period.book_id
       AND journal.business_date BETWEEN selected_period.start_date AND selected_period.end_date
       AND journal.status IN ('DRAFT','APPROVED');

    WITH required(check_key) AS (
      SELECT unnest(required_external_checks)
    ), latest AS (
      SELECT DISTINCT ON (evidence.check_key)
             evidence.check_key, evidence.id, evidence.status
        FROM ledger.fiscal_period_close_evidence evidence
       WHERE evidence.tenant_id = p_tenant_id
         AND evidence.period_id = selected_period.id
         AND evidence.created_at > coalesce((
           SELECT max(status_change.occurred_at)
             FROM ledger.fiscal_period_status_changes status_change
            WHERE status_change.tenant_id = p_tenant_id
              AND status_change.period_id = selected_period.id
              AND status_change.new_status = 'OPEN'
         ), '-infinity'::timestamptz)
         AND evidence.check_key = ANY(required_external_checks)
       ORDER BY evidence.check_key, evidence.created_at DESC, evidence.id DESC
    )
    SELECT
      coalesce(array_agg(required.check_key ORDER BY required.check_key)
        FILTER (WHERE latest.id IS NULL), '{}'::text[]),
      coalesce(array_agg(required.check_key ORDER BY required.check_key)
        FILTER (WHERE latest.status = 'BLOCKED'), '{}'::text[]),
      coalesce(array_agg(latest.id ORDER BY required.check_key)
        FILTER (WHERE latest.id IS NOT NULL), '{}'::uuid[])
      INTO pending_checks, blocked_checks, evidence_ids
      FROM required
      LEFT JOIN latest USING (check_key);

    readiness_snapshot := jsonb_build_object(
      'unpostedDocumentCount', unposted_document_count,
      'pendingChecks', to_jsonb(pending_checks),
      'blockedChecks', to_jsonb(blocked_checks),
      'evidenceIds', to_jsonb(evidence_ids),
      'unsupportedChecksRequireAttestation', true
    );

    IF unposted_document_count > 0 THEN
      RAISE EXCEPTION 'FISCAL_PERIOD_HAS_UNPOSTED_DOCUMENTS' USING ERRCODE = '23514';
    END IF;
    IF cardinality(blocked_checks) > 0 THEN
      RAISE EXCEPTION 'FISCAL_PERIOD_CLOSE_CHECKLIST_BLOCKED' USING ERRCODE = '23514';
    END IF;
    IF cardinality(pending_checks) > 0 THEN
      RAISE EXCEPTION 'FISCAL_PERIOD_CLOSE_CHECKLIST_INCOMPLETE' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE ledger.fiscal_periods
     SET status = p_target_status,
         closed_at = CASE WHEN p_target_status = 'OPEN' THEN NULL ELSE now() END,
         closed_by = CASE WHEN p_target_status = 'OPEN' THEN NULL ELSE core.current_user_id() END
   WHERE tenant_id = p_tenant_id AND id = selected_period.id
   RETURNING * INTO changed_period;

  INSERT INTO ledger.fiscal_period_status_changes (
    tenant_id, company_id, book_id, period_id, previous_status, new_status,
    reason, actor_user_id, authorization_capability, authorization_membership_id,
    correlation_id, readiness_snapshot
  ) VALUES (
    p_tenant_id, selected_period.company_id, selected_period.book_id, selected_period.id,
    selected_period.status, p_target_status, btrim(p_reason), core.current_user_id(),
    authorization_capability, authorization_membership_id, p_correlation_id, readiness_snapshot
  );

  INSERT INTO audit.events (
    tenant_id, company_id, actor_user_id, event_type, entity_type, entity_id,
    correlation_id, metadata
  ) VALUES (
    p_tenant_id, selected_period.company_id, core.current_user_id(),
    'LEDGER.FISCAL_PERIOD_STATUS_CHANGED', 'FISCAL_PERIOD', selected_period.id,
    p_correlation_id,
    jsonb_build_object(
      'previousStatus', selected_period.status,
      'newStatus', p_target_status,
      'reason', btrim(p_reason),
      'authorizationCapability', authorization_capability,
      'authorizationMembershipId', authorization_membership_id,
      'readiness', readiness_snapshot
    )
  );

  INSERT INTO integration.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload
  ) VALUES (
    p_tenant_id, 'FISCAL_PERIOD', selected_period.id, 'FiscalPeriodStatusChanged',
    jsonb_build_object(
      'periodId', selected_period.id,
      'companyId', selected_period.company_id,
      'bookId', selected_period.book_id,
      'previousStatus', selected_period.status,
      'newStatus', p_target_status
    )
  );

  RETURN NEXT changed_period;
END
$$;

CREATE OR REPLACE FUNCTION ledger.validate_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_debit numeric(38,12);
  total_credit numeric(38,12);
  line_count integer;
  invalid_account_count integer;
  matched_period uuid;
  matched_period_status varchar(16);
  soft_close_override_reason text;
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

    SELECT id, status INTO matched_period, matched_period_status
      FROM ledger.fiscal_periods
     WHERE tenant_id = NEW.tenant_id
       AND company_id = NEW.company_id
       AND book_id = NEW.book_id
       AND NEW.business_date BETWEEN start_date AND end_date
     ORDER BY start_date DESC LIMIT 1 FOR UPDATE;
    IF matched_period IS NULL THEN
      RAISE EXCEPTION 'ACCOUNTING_PERIOD_CLOSED_OR_MISSING' USING ERRCODE = '23514';
    END IF;
    IF matched_period_status = 'HARD_CLOSED' THEN
      RAISE EXCEPTION 'ACCOUNTING_PERIOD_HARD_CLOSED' USING ERRCODE = '23514';
    END IF;
    soft_close_override_reason := nullif(btrim(current_setting('app.soft_close_override_reason', true)), '');
    IF matched_period_status = 'SOFT_CLOSED' THEN
      IF soft_close_override_reason IS NULL THEN
        RAISE EXCEPTION 'SOFT_CLOSE_OVERRIDE_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF length(soft_close_override_reason) > 500 THEN
        RAISE EXCEPTION 'INVALID_SOFT_CLOSE_OVERRIDE' USING ERRCODE = '23514';
      END IF;
      IF NOT core.has_capability('period.post.soft-closed') THEN
        RAISE EXCEPTION 'SOFT_CLOSE_OVERRIDE_NOT_AUTHORIZED' USING ERRCODE = '42501';
      END IF;
    ELSIF soft_close_override_reason IS NOT NULL THEN
      RAISE EXCEPTION 'SOFT_CLOSE_OVERRIDE_NOT_APPLICABLE' USING ERRCODE = '23514';
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
END
$$;

REVOKE INSERT, UPDATE ON ledger.fiscal_periods FROM ledgerly_runtime;
GRANT SELECT ON ledger.fiscal_period_close_evidence, ledger.fiscal_period_status_changes TO ledgerly_runtime;

REVOKE ALL ON FUNCTION ledger.create_fiscal_period(uuid, uuid, uuid, uuid, text, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ledger.record_fiscal_period_close_evidence(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ledger.transition_fiscal_period(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger.create_fiscal_period(uuid, uuid, uuid, uuid, text, date, date, uuid) TO ledgerly_runtime;
GRANT EXECUTE ON FUNCTION ledger.record_fiscal_period_close_evidence(uuid, uuid, text, text, text, text, uuid) TO ledgerly_runtime;
GRANT EXECUTE ON FUNCTION ledger.transition_fiscal_period(uuid, uuid, text, text, uuid) TO ledgerly_runtime;

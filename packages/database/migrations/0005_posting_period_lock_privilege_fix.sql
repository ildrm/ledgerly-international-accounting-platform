-- Fiscal-period rows are intentionally read-only to the runtime role. Posting
-- still has to lock the matching period so a close cannot race a journal post.
-- Execute the trigger function with its migration-owner privileges while
-- retaining the caller's transaction-local tenant and user context for RLS and
-- capability checks.
ALTER FUNCTION ledger.validate_posting() SECURITY DEFINER;
ALTER FUNCTION ledger.validate_posting() SET search_path = pg_catalog, core, ledger;

REVOKE ALL ON FUNCTION ledger.validate_posting() FROM PUBLIC;

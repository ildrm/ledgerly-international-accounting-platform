-- Permit an authenticated user to discover only tenants where they hold an active membership.
-- Active tenant context remains the required path for all tenant-scoped business operations.
DROP POLICY tenant_scope ON core.tenants;

CREATE POLICY tenant_scope ON core.tenants
  USING (
    id = core.current_tenant_id()
    OR EXISTS (
      SELECT 1
        FROM core.memberships membership
       WHERE membership.tenant_id = core.tenants.id
         AND membership.user_id = core.current_user_id()
         AND membership.status = 'ACTIVE'
    )
  )
  WITH CHECK (id = core.current_tenant_id());

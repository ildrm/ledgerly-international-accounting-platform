# API contract

The running API exposes OpenAPI 3.1 JSON at `/api/openapi.json` and Swagger UI at `/api/docs`. The canonical base is `/api/v1`.

## Conventions

- `Authorization: Bearer <opaque-session-token>` authenticates protected routes.
- `x-tenant-id: <uuid>` selects an active tenant only after membership authorization.
- `x-correlation-id: <uuid-v4>` is accepted or generated and returned in problem details/logs.
- `idempotency-key` is mandatory for retryable posting/reversal commands.
- Money/rates are decimal strings; business dates are `YYYY-MM-DD`; instants are ISO 8601 UTC.
- Errors are `application/problem+json` with stable `code`/`messageKey`, safe parameters and correlation ID.

## Current endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health/live` | process liveness |
| GET | `/health/ready` | database readiness |
| POST | `/api/v1/identity/register` | register and issue a session |
| POST | `/api/v1/identity/login` | authenticate and issue a session |
| POST | `/api/v1/identity/logout` | revoke current session |
| GET | `/api/v1/identity/me` | profile and localization preferences |
| PATCH | `/api/v1/identity/me/localization` | persist independent UI/format/time/calendar/digit preferences |
| POST/GET | `/api/v1/tenants` | atomic onboarding (explicit fiscal-period dates) / list accessible tenants |
| GET | `/api/v1/tenants/current/companies` | list companies under active membership |
| POST/GET | `/api/v1/accounts` | create/list posting accounts |
| POST | `/api/v1/journals` | create a balanced or unbalanced editable draft (posting validates balance) |
| POST | `/api/v1/journals/{id}/post` | atomically validate and post |
| POST | `/api/v1/journals/{id}/reverse` | create/post exact linked reversal |
| GET | `/api/v1/reports/trial-balance` | reconstruct posted trial balance with provenance |

## Example problem

```json
{
  "type": "https://docs.ledgerly.app/problems/tenant-access-denied",
  "title": "TENANT_ACCESS_DENIED",
  "status": 403,
  "code": "TENANT_ACCESS_DENIED",
  "messageKey": "errors.TENANT_ACCESS_DENIED",
  "params": {},
  "fieldErrors": [],
  "instance": "/api/v1/tenants/current/companies",
  "correlationId": "..."
}
```

Bearer tokens are shown only in local responses and must never be logged, committed, or placed in URLs. The deterministic seed credential is development-only.

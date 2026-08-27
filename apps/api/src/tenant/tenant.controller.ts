import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { CurrentPrincipal, type Principal } from '../identity/principal';
import { SessionGuard } from '../identity/session.guard';
import { CurrentTenant, type ActiveTenant } from './tenant-context';
import { TenantGuard } from './tenant.guard';
import { type CreateTenantInput, createTenantSchema } from './tenant.schemas';
import { TenantService } from './tenant.service';
import { randomUUID } from 'node:crypto';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('api/v1/tenants')
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  @Post()
  @ApiOperation({ summary: 'Create a tenant, owner membership, and first legal entity atomically' })
  create(@CurrentPrincipal() principal: Principal, @Body(new ZodBodyPipe(createTenantSchema)) body: CreateTenantInput) {
    return this.tenants.create(principal, body);
  }

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.tenants.listForUser(principal);
  }

  @Get('current/companies')
  @UseGuards(TenantGuard)
  listCompanies(
    @CurrentPrincipal() principal: Principal,
    @CurrentTenant() tenant: ActiveTenant,
    @Headers('x-correlation-id') suppliedCorrelationId: string | undefined,
  ) {
    return this.tenants.listCompanies(principal, tenant.tenantId, correlationId(suppliedCorrelationId));
  }
}

function correlationId(value: string | undefined): string {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : randomUUID();
}

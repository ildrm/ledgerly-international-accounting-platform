import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse,
  ApiOperation, ApiQuery, ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { CurrentPrincipal, type Principal } from '../identity/principal';
import { SessionGuard } from '../identity/session.guard';
import { CurrentTenant, type ActiveTenant } from '../tenant/tenant-context';
import { TenantGuard } from '../tenant/tenant.guard';
import {
  closeReadinessOpenApiSchema,
  createFiscalPeriodOpenApiSchema,
  createFiscalPeriodSchema,
  fiscalPeriodOpenApiSchema,
  fiscalPeriodScopeQuerySchema,
  recordCloseEvidenceOpenApiSchema,
  recordCloseEvidenceSchema,
  transitionFiscalPeriodOpenApiSchema,
  transitionFiscalPeriodSchema,
  type CreateFiscalPeriodInput,
  type FiscalPeriodScopeQuery,
  type RecordCloseEvidenceInput,
  type TransitionFiscalPeriodInput,
} from './fiscal-period.schemas';
import { FiscalPeriodService } from './fiscal-period.service';

@ApiTags('fiscal-periods')
@ApiBearerAuth()
@ApiHeader({ name: 'x-tenant-id', required: true, description: 'Active tenant UUID' })
@UseGuards(SessionGuard, TenantGuard)
@Controller('api/v1/fiscal-periods')
export class FiscalPeriodController {
  constructor(private readonly periods: FiscalPeriodService) {}

  @Get()
  @ApiOperation({ summary: 'List fiscal periods within one active company and book' })
  @ApiQuery({ name: 'companyId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'bookId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ schema: { type: 'object', properties: { items: { type: 'array', items: fiscalPeriodOpenApiSchema } } } })
  list(
    @CurrentPrincipal() principal: Principal,
    @CurrentTenant() tenant: ActiveTenant,
    @Req() request: FastifyRequest,
    @Query(new ZodBodyPipe(fiscalPeriodScopeQuerySchema)) query: FiscalPeriodScopeQuery,
  ) {
    return this.periods.list(principal, tenant, correlationId(request), query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a non-overlapping open fiscal period (period.create capability)' })
  @ApiBody({ schema: createFiscalPeriodOpenApiSchema })
  @ApiCreatedResponse({ schema: fiscalPeriodOpenApiSchema })
  create(
    @CurrentPrincipal() principal: Principal,
    @CurrentTenant() tenant: ActiveTenant,
    @Req() request: FastifyRequest,
    @Body(new ZodBodyPipe(createFiscalPeriodSchema)) body: CreateFiscalPeriodInput,
  ) {
    return this.periods.create(principal, tenant, correlationId(request), body);
  }

  @Post(':id/transitions')
  @ApiOperation({ summary: 'Apply an audited period state transition; hard-close reopen requires period.reopen.hard-closed' })
  @ApiBody({ schema: transitionFiscalPeriodOpenApiSchema })
  @ApiCreatedResponse({ schema: fiscalPeriodOpenApiSchema })
  transition(
    @CurrentPrincipal() principal: Principal,
    @CurrentTenant() tenant: ActiveTenant,
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodBodyPipe(transitionFiscalPeriodSchema)) body: TransitionFiscalPeriodInput,
  ) {
    return this.periods.transition(principal, tenant, correlationId(request), id, body);
  }

  @Post(':id/close-evidence')
  @ApiOperation({ summary: 'Record append-only close evidence without representing unavailable subsystems as automated passes' })
  @ApiBody({ schema: recordCloseEvidenceOpenApiSchema })
  @ApiCreatedResponse({ schema: { type: 'object', additionalProperties: true } })
  recordEvidence(
    @CurrentPrincipal() principal: Principal,
    @CurrentTenant() tenant: ActiveTenant,
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodBodyPipe(recordCloseEvidenceSchema)) body: RecordCloseEvidenceInput,
  ) {
    return this.periods.recordEvidence(principal, tenant, correlationId(request), id, body);
  }

  @Get(':id/close-readiness')
  @ApiOperation({ summary: 'Read the typed period-close checklist and supported-control drill downs' })
  @ApiOkResponse({ schema: closeReadinessOpenApiSchema })
  closeReadiness(
    @CurrentPrincipal() principal: Principal,
    @CurrentTenant() tenant: ActiveTenant,
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.periods.closeReadiness(principal, tenant, correlationId(request), id);
  }

  @Get(':id/unposted-documents')
  @ApiOperation({ summary: 'Drill down into draft and approved journals blocking a hard close' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  unpostedDocuments(
    @CurrentPrincipal() principal: Principal,
    @CurrentTenant() tenant: ActiveTenant,
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.periods.unpostedDocuments(principal, tenant, correlationId(request), id);
  }

  @Get(':id/status-history')
  @ApiOperation({ summary: 'List append-only status transitions and hard-reopen authorization provenance' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  statusHistory(
    @CurrentPrincipal() principal: Principal,
    @CurrentTenant() tenant: ActiveTenant,
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.periods.statusHistory(principal, tenant, correlationId(request), id);
  }
}

function correlationId(request: FastifyRequest): string {
  const candidate = request.headers['x-correlation-id'];
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : randomUUID();
}

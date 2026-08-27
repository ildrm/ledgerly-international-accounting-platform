import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { CurrentPrincipal, type Principal } from '../identity/principal';
import { SessionGuard } from '../identity/session.guard';
import { CurrentTenant, type ActiveTenant } from '../tenant/tenant-context';
import { TenantGuard } from '../tenant/tenant.guard';
import { LedgerService } from './ledger.service';
import {
  type CreateAccountInput, type CreateExchangeRateInput, type CreateJournalInput, type ExchangeRateQuery,
  type PostJournalInput, type ReverseJournalInput, type TrialBalanceQuery, createAccountSchema, createExchangeRateSchema,
  createJournalSchema, exchangeRateQuerySchema, postJournalSchema, reverseJournalSchema, trialBalanceQuerySchema,
} from './ledger.schemas';

const bookQuerySchema = z.object({ bookId: z.uuid() });

@ApiTags('ledger')
@ApiBearerAuth()
@ApiHeader({ name: 'x-tenant-id', required: true, description: 'Active tenant UUID' })
@UseGuards(SessionGuard, TenantGuard)
@Controller('api/v1')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Post('accounts')
  @ApiOperation({ summary: 'Create a tenant-scoped chart-of-accounts node' })
  createAccount(@CurrentPrincipal() principal: Principal, @CurrentTenant() tenant: ActiveTenant, @Req() request: FastifyRequest, @Body(new ZodBodyPipe(createAccountSchema)) body: CreateAccountInput) {
    return this.ledger.createAccount(principal, tenant, correlationId(request), body);
  }

  @Get('accounts')
  listAccounts(@CurrentPrincipal() principal: Principal, @CurrentTenant() tenant: ActiveTenant, @Req() request: FastifyRequest, @Query(new ZodBodyPipe(bookQuerySchema)) query: { bookId: string }) {
    return this.ledger.listAccounts(principal, tenant, correlationId(request), query.bookId);
  }

  @Post('exchange-rates')
  @ApiOperation({ summary: 'Record an immutable, sourced exchange-rate observation' })
  createExchangeRate(@CurrentPrincipal() principal: Principal, @CurrentTenant() tenant: ActiveTenant, @Req() request: FastifyRequest, @Body(new ZodBodyPipe(createExchangeRateSchema)) body: CreateExchangeRateInput) {
    return this.ledger.createExchangeRate(principal, tenant, correlationId(request), body);
  }

  @Get('exchange-rates/historical')
  @ApiOperation({ summary: 'Select the latest eligible historical rate on or before a business date' })
  historicalExchangeRate(@CurrentPrincipal() principal: Principal, @CurrentTenant() tenant: ActiveTenant, @Req() request: FastifyRequest, @Query(new ZodBodyPipe(exchangeRateQuerySchema)) query: ExchangeRateQuery) {
    return this.ledger.historicalExchangeRate(principal, tenant, correlationId(request), query);
  }

  @Post('journals')
  @ApiOperation({ summary: 'Create an editable journal draft without claiming financial posting success' })
  createJournal(@CurrentPrincipal() principal: Principal, @CurrentTenant() tenant: ActiveTenant, @Req() request: FastifyRequest, @Body(new ZodBodyPipe(createJournalSchema)) body: CreateJournalInput) {
    return this.ledger.createDraft(principal, tenant, correlationId(request), body);
  }

  @Post('journals/:id/post')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOperation({ summary: 'Atomically validate and post a balanced journal; soft-close posting requires a documented authorized override' })
  @ApiBody({ required: false, schema: {
    type: 'object', properties: { softCloseOverride: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 3, maxLength: 500 } } } },
  } })
  postJournal(@CurrentPrincipal() principal: Principal, @CurrentTenant() tenant: ActiveTenant, @Req() request: FastifyRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Headers('idempotency-key') key = '', @Body(new ZodBodyPipe(postJournalSchema)) body: PostJournalInput) {
    return this.ledger.post(principal, tenant, correlationId(request), id, key, body);
  }

  @Post('journals/:id/reverse')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOperation({ summary: 'Create and post an exact immutable reversal' })
  reverseJournal(@CurrentPrincipal() principal: Principal, @CurrentTenant() tenant: ActiveTenant, @Req() request: FastifyRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Headers('idempotency-key') key: string | undefined, @Body(new ZodBodyPipe(reverseJournalSchema)) body: ReverseJournalInput) {
    return this.ledger.reverse(principal, tenant, correlationId(request), id, key ?? '', body);
  }

  @Get('reports/trial-balance')
  @ApiOperation({ summary: 'Reconstruct a trial balance solely from posted ledger lines' })
  trialBalance(@CurrentPrincipal() principal: Principal, @CurrentTenant() tenant: ActiveTenant, @Req() request: FastifyRequest, @Query(new ZodBodyPipe(trialBalanceQuerySchema)) query: TrialBalanceQuery) {
    return this.ledger.trialBalance(principal, tenant, correlationId(request), query);
  }
}

function correlationId(request: FastifyRequest): string {
  const candidate = request.headers['x-correlation-id'];
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : randomUUID();
}

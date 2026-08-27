import { Body, Controller, Get, Headers, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { IdentityService } from './identity.service';
import {
  type LocalizationPreferenceInput,
  type LoginInput,
  type RegisterInput,
  localizationPreferenceSchema,
  loginSchema,
  registerSchema,
} from './identity.schemas';
import { CurrentPrincipal, type Principal } from './principal';
import { SessionGuard } from './session.guard';

@ApiTags('identity')
@Controller('api/v1/identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a user and an opaque revocable session' })
  register(
    @Body(new ZodBodyPipe(registerSchema)) body: RegisterInput,
    @Req() request: FastifyRequest,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.identity.register(body, userAgent, request.ip);
  }

  @Post('login')
  @Throttle({
    default: { limit: 8, ttl: 60_000, blockDuration: 5 * 60_000 },
    account: { limit: 12, ttl: 5 * 60_000, blockDuration: 15 * 60_000 },
  })
  @ApiOperation({ summary: 'Authenticate with constant-work password verification' })
  login(
    @Body(new ZodBodyPipe(loginSchema)) body: LoginInput,
    @Req() request: FastifyRequest,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.identity.login(body, userAgent, request.ip);
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  @ApiBearerAuth()
  logout(@Headers('authorization') authorization: string, @CurrentPrincipal() principal: Principal) {
    return this.identity.logout(authorization.slice(7), principal);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiBearerAuth()
  getProfile(@CurrentPrincipal() principal: Principal) {
    return this.identity.getProfile(principal);
  }

  @Patch('me/localization')
  @UseGuards(SessionGuard)
  @ApiBearerAuth()
  updateLocalization(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodBodyPipe(localizationPreferenceSchema)) body: LocalizationPreferenceInput,
  ) {
    return this.identity.updateLocalization(principal, body);
  }
}

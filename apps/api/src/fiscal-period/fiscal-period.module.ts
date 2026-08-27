import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import { FiscalPeriodController } from './fiscal-period.controller';
import { FiscalPeriodService } from './fiscal-period.service';

@Module({
  imports: [IdentityModule, TenantModule],
  controllers: [FiscalPeriodController],
  providers: [FiscalPeriodService],
})
export class FiscalPeriodModule {}

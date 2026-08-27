import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenantController } from './tenant.controller';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';

@Module({
  imports: [IdentityModule],
  controllers: [TenantController],
  providers: [TenantService, TenantGuard],
  exports: [TenantGuard],
})
export class TenantModule {}

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

@Module({ imports: [IdentityModule, TenantModule], controllers: [LedgerController], providers: [LedgerService] })
export class LedgerModule {}

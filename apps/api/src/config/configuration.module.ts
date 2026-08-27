import { Global, Module } from '@nestjs/common';
import { ENVIRONMENT, loadEnvironment } from './environment';

@Global()
@Module({ providers: [{ provide: ENVIRONMENT, useFactory: loadEnvironment }], exports: [ENVIRONMENT] })
export class ConfigurationModule {}

import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoreConfig } from './core.config';
import { CqrsModule } from '@nestjs/cqrs';
import { getEnvPaths } from './utils/get-env-paths';

const envPaths = getEnvPaths();

console.log('Loading env files from:', envPaths);

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envPaths,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    CqrsModule,
  ],
  providers: [CoreConfig],
  exports: [CoreConfig, ConfigModule, CqrsModule],
})
export class CoreModule {}

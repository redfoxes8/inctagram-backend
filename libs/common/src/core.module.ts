import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoreConfig } from './core.config';
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
  ],
  providers: [CoreConfig],
  exports: [CoreConfig, ConfigModule],
})
export class CoreModule {}

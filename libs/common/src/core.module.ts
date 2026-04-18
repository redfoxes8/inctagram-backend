import { ConfigModule } from '@nestjs/config';

import { Global, Module } from '@nestjs/common';
import { getEnvPaths } from './utils/get-env-paths';
import { CoreConfig } from './core.config';

const envPaths = getEnvPaths();
console.log('Loading env files from:', envPaths);

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvPaths(),
      // Если в K8s нет файлов, ConfigModule просто проигнорирует пути и пойдет в process.env
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
  ],
  providers: [CoreConfig],
  exports: [CoreConfig, ConfigModule],
})
export class CoreModule {}

import { DynamicModule, Module } from '@nestjs/common';

import { CoreModule } from '../../../libs/common/src/core.module';

import { FilesConfig } from './core/files.config';
import { FilesConfigModule } from './core/files-config.module';
import { FilesController } from './modules/testing/api/files.controller';

@Module({
  imports: [CoreModule, FilesConfigModule],
  controllers: [FilesController],
})
export class AppModule {
  static forRoot(config: FilesConfig): DynamicModule {
    console.log('TestingModule connected?', config.includeTestingModule);

    return {
      module: AppModule,
      imports: [...(config.includeTestingModule ? [] : [])],
      controllers: [FilesController],
    };
  }
}

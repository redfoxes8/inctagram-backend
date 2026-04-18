import { DynamicModule, Module } from '@nestjs/common';

import { CoreModule } from '../../../libs/common/src/core.module';

import { FilesConfig } from './core/files.config';
import { FilesConfigModule } from './core/files-config.module';
import { MicroFilesServiceController } from './micro-files-service.controller';
import { MicroFilesServiceService } from './micro-files-service.service';

@Module({
  imports: [CoreModule, FilesConfigModule],
  controllers: [MicroFilesServiceController],
  providers: [MicroFilesServiceService],
})
export class AppModule {
  static forRoot(config: FilesConfig): DynamicModule {
    console.log('TestingModule connected?', config.includeTestingModule);

    return {
      module: AppModule,
      imports: [...(config.includeTestingModule ? [] : [])],
      controllers: [MicroFilesServiceController],
      providers: [MicroFilesServiceService],
    };
  }
}

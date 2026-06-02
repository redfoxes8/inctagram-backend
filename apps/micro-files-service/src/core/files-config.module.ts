import { Global, Module } from '@nestjs/common';

import { FilesConfig } from './files.config';

@Global()
@Module({
  providers: [FilesConfig],
  exports: [FilesConfig],
})
export class FilesConfigModule {}

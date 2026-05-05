import { Module } from '@nestjs/common';

import { FilesConfig } from './files.config';

@Module({
  providers: [FilesConfig],
  exports: [FilesConfig],
})
export class FilesConfigModule {}

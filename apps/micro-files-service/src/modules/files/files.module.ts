import { Module } from '@nestjs/common';

import { FilesConfigModule } from '../../core/files-config.module';
import { AwsStorageAdapter } from '../files/infrastructure/aws-storage.adapter';

@Module({
  imports: [FilesConfigModule],
  providers: [AwsStorageAdapter],
  exports: [AwsStorageAdapter],
})
export class FilesModule {}

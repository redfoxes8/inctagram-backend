import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FilesModule } from '../files/files.module';
import { CleanupPendingFilesCron } from './cleanup-pending-files.cron';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    FilesModule,
  ],
  providers: [CleanupPendingFilesCron],
})
export class CronModule {}

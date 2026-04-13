import { Module } from '@nestjs/common';
import { MicroFilesServiceController } from './micro-files-service.controller';
import { MicroFilesServiceService } from './micro-files-service.service';

@Module({
  imports: [],
  controllers: [MicroFilesServiceController],
  providers: [MicroFilesServiceService],
})
export class MicroFilesServiceModule {}

import { Module } from '@nestjs/common';
import { FileGrpcClientModule } from './infrastructure/file-grpc-client.module';

@Module({
  imports: [FileGrpcClientModule],
  controllers: [],
  providers: [],
})
export class FilesModule {}

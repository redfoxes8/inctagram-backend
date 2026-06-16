import { Module } from '@nestjs/common';
import { FileGrpcClientModule } from './infrastructure/file-grpc-client.module';
import { FileGrpcAdapter } from './infrastructure/adapters/file.grpc-adapter';
import { IRpcAdapter } from './domain/interfaces/rpc-adapter.interface';
import { FileController } from './api/file.controller';

@Module({
  imports: [FileGrpcClientModule],
  controllers: [FileController],
  providers: [
    {
      provide: IRpcAdapter,
      useClass: FileGrpcAdapter,
    },
  ],
})
export class FilesModule {}

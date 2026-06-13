import { Module } from '@nestjs/common';
import { FileGrpcClientModule } from './infrastructure/file-grpc-client.module';
import { FileGrpcAdapter } from './infrastructure/adapters/file.grpc-adapter';
import { IRpcAdapter } from './domain/interfaces/rpc-adapter.interface';

@Module({
  imports: [FileGrpcClientModule],
  controllers: [],
  providers: [
    {
      provide: IRpcAdapter,
      useClass: FileGrpcAdapter,
    },
  ],
})
export class FilesModule {}

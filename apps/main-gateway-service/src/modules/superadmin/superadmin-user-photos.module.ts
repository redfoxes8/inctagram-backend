import { Module } from '@nestjs/common';
import { PostGrpcClientModule } from '../posts/infrastructure/post-grpc-client.module';
import { SuperadminUserPhotosReader } from './domain/superadmin-user-photos.port';
import { GrpcSuperadminUserPhotosReader } from './infrastructure/grpc-superadmin-user-photos.reader';
import { SuperadminUserPhotosResolver } from './api/superadmin-user-photos.resolver';

@Module({
  imports: [PostGrpcClientModule],
  providers: [
    { provide: SuperadminUserPhotosReader, useClass: GrpcSuperadminUserPhotosReader },
    SuperadminUserPhotosResolver,
  ],
})
export class SuperadminUserPhotosModule {}

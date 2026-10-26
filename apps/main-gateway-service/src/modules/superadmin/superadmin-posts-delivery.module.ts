import { Module } from '@nestjs/common';
import { GatewayConfigModule } from '../../core/gateway-config.module';
import { SuperadminProfileLookupModule } from './superadmin-profile-lookup.module';
import { SuperadminPostPublishedReader } from './domain/superadmin-post-published-reader.port';
import { GrpcSuperadminPostsReader } from './infrastructure/grpc-superadmin-posts.reader';
import { SuperadminPostsPageReader } from './domain/superadmin-posts-page-reader.port';
import { PostGrpcClientModule } from '../posts/infrastructure/post-grpc-client.module';
import { GetSuperadminPostsQuery } from './application/get-superadmin-posts.query';
import { SuperadminPostsResolver } from './api/superadmin-posts.resolver';
import { PostPublishedFanoutConsumer } from './infrastructure/post-published-fanout.consumer';
import { PostPublishedReads } from './application/post-published-reads';
import { PostPublishedDelivery } from './application/post-published-delivery';
import { SuperadminPostSubscription } from './api/superadmin-post-subscription';

@Module({
  imports: [GatewayConfigModule, SuperadminProfileLookupModule, PostGrpcClientModule],
  providers: [
    GrpcSuperadminPostsReader,
    { provide: SuperadminPostPublishedReader, useExisting: GrpcSuperadminPostsReader },
    { provide: SuperadminPostsPageReader, useExisting: GrpcSuperadminPostsReader },
    GetSuperadminPostsQuery,
    SuperadminPostsResolver,
    PostPublishedReads,
    PostPublishedDelivery,
    PostPublishedFanoutConsumer,
    SuperadminPostSubscription,
  ],
  exports: [SuperadminPostSubscription],
})
export class SuperadminPostsDeliveryModule {}

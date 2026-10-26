import { Module } from '@nestjs/common';
import { GatewayConfigModule } from '../../core/gateway-config.module';
import { SuperadminProfileLookupModule } from './superadmin-profile-lookup.module';
import { SuperadminPostPublishedReader } from './domain/superadmin-post-published-reader.port';
import { UnavailablePostPublishedReader } from './infrastructure/unavailable-post-published.reader';
import { PostPublishedFanoutConsumer } from './infrastructure/post-published-fanout.consumer';
import { PostPublishedReads } from './application/post-published-reads';
import { PostPublishedDelivery } from './application/post-published-delivery';
import { SuperadminPostSubscription } from './api/superadmin-post-subscription';

// Import and replace the unavailable reader only with the real Post adapter in D6b.
@Module({
  imports: [GatewayConfigModule, SuperadminProfileLookupModule],
  providers: [
    { provide: SuperadminPostPublishedReader, useClass: UnavailablePostPublishedReader },
    PostPublishedReads,
    PostPublishedDelivery,
    PostPublishedFanoutConsumer,
    SuperadminPostSubscription,
  ],
  exports: [SuperadminPostSubscription],
})
export class SuperadminPostsDeliveryModule {}

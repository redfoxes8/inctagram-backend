import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ClientProxyFactory, Transport, type ClientGrpc } from '@nestjs/microservices';
import { join } from 'node:path';
import { firstValueFrom, timeout } from 'rxjs';
import { PostConfig } from '../../../../core/post.config';
import {
  PostProfileExport,
  type PostProfileExportResult,
} from '../../application/ports/post-profile-bootstrap.port';
import {
  validatePaymentProfileExportRequest,
  normalizePaymentProfileExportPage,
  type PaymentProfileExportRequest,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-export';
import {
  INCTAGRAM_USER_V1_PACKAGE_NAME,
  USER_SERVICE_NAME,
  type UserServiceClient,
} from '../../../../../../../libs/contracts/src/generated/user';

@Injectable()
export class PostProfileExportClient extends PostProfileExport implements OnModuleDestroy {
  private readonly logger = new Logger(PostProfileExportClient.name);
  private readonly client: (ClientGrpc & { close(): void }) | null;
  private readonly service: UserServiceClient | null;

  constructor(config: PostConfig) {
    super();
    if (!config.userProjectionSyncEnabled) {
      this.client = null;
      this.service = null;
      return;
    }
    this.client = ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: INCTAGRAM_USER_V1_PACKAGE_NAME,
        protoPath: join(process.cwd(), 'libs/contracts/src/proto/user.proto'),
        url: config.gatewayUserServiceGrpcUrl!,
      },
    });
    this.service = this.client.getService<UserServiceClient>(USER_SERVICE_NAME);
  }

  async exportPage(request: PaymentProfileExportRequest): Promise<PostProfileExportResult> {
    if (!this.service) return { outcome: 'UNAVAILABLE', unimplemented: false };
    try {
      validatePaymentProfileExportRequest(request);
      // RxJS timeout unsubscribes/cancels the unary call; it is not a propagated gRPC deadline.
      const response = await firstValueFrom(
        this.service.exportPaymentUserProfiles(request).pipe(timeout({ first: 5000 })),
      );
      const page = normalizePaymentProfileExportPage({
        request,
        value: {
          ...response,
          // Protobuf omits an empty repeated field with the project's current loader defaults.
          items: (response.items ?? []).map((snapshot) => ({
            ...snapshot,
            username: snapshot.username ?? null,
          })),
        },
      });
      return { outcome: 'SUCCESS', page };
    } catch (error: unknown) {
      const unimplemented =
        typeof error === 'object' && error !== null && 'code' in error && error.code === 12;
      this.logger.warn({
        event: 'post.profile.export',
        code: unimplemented ? 'EXPORT_UNIMPLEMENTED' : 'EXPORT_UNAVAILABLE',
      });
      return { outcome: 'UNAVAILABLE', unimplemented };
    }
  }

  onModuleDestroy(): void {
    this.client?.close();
  }
}

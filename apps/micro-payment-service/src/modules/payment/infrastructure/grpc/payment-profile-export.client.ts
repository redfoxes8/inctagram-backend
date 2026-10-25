import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ClientProxyFactory, Transport, type ClientGrpc } from '@nestjs/microservices';
import { join } from 'node:path';
import { firstValueFrom, timeout } from 'rxjs';
import { PaymentConfig } from '../../../../core/payment.config';
import {
  IPaymentProfileExportClient,
  type PaymentProfileExportResult,
} from '../../application/ports/payment-profile-bootstrap.port';
import {
  normalizePaymentProfileExportPage,
  type PaymentProfileExportRequest,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-export';
import {
  INCTAGRAM_USER_V1_PACKAGE_NAME,
  USER_SERVICE_NAME,
  type UserServiceClient,
} from '../../../../../../../libs/contracts/src/generated/user';

@Injectable()
export class PaymentProfileExportClient
  extends IPaymentProfileExportClient
  implements OnModuleDestroy
{
  private readonly logger = new Logger(PaymentProfileExportClient.name);
  private readonly client: (ClientGrpc & { close(): void }) | null;
  private readonly service: UserServiceClient | null;
  constructor(config: PaymentConfig) {
    super();
    // Disabled mode creates neither a channel nor a service proxy and requires no address.
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
  async exportPage(request: PaymentProfileExportRequest): Promise<PaymentProfileExportResult> {
    if (!this.service) return { outcome: 'UNAVAILABLE', unimplemented: false };
    try {
      // Unsubscribing on timeout cancels Nest's unary call; this is not a propagated gRPC deadline.
      const response = await firstValueFrom(
        this.service.exportPaymentUserProfiles(request).pipe(timeout({ first: 5000 })),
      );
      const page = normalizePaymentProfileExportPage({
        request,
        value: {
          ...response,
          items: (response.items ?? []).map((item) => ({
            ...item,
            username: item.username ?? null,
          })),
        },
      });
      return { outcome: 'SUCCESS', page };
    } catch (error: unknown) {
      this.logger.warn({
        event: 'payment.profile.export',
        code:
          typeof error === 'object' && error !== null && 'code' in error && error.code === 12
            ? 'EXPORT_UNIMPLEMENTED'
            : 'EXPORT_UNAVAILABLE',
      });
      return {
        outcome: 'UNAVAILABLE',
        unimplemented:
          typeof error === 'object' && error !== null && 'code' in error && error.code === 12,
      };
    }
  }
  onModuleDestroy(): void {
    this.client?.close();
  }
}

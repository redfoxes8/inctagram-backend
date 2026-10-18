import { Injectable } from '@nestjs/common';
import { PaymentGrpcClient } from '../../payments/infrastructure/payment-grpc.client';
import {
  SuperadminPaymentHistory,
  type SuperadminPaymentHistoryInput,
} from '../domain/superadmin-payment-history.port';
import type { SuperadminPaymentConnection } from '../../../../../../libs/common/types/superadmin-payments';
import { SuperadminPaymentsConfig } from './superadmin-payments.config';
import { mapSuperadminPaymentHistory } from './superadmin-payment-history.mapper';

@Injectable()
export class GrpcSuperadminPaymentHistory extends SuperadminPaymentHistory {
  constructor(
    private readonly client: PaymentGrpcClient,
    private readonly config: SuperadminPaymentsConfig,
  ) {
    super();
  }

  async getHistory(input: SuperadminPaymentHistoryInput): Promise<SuperadminPaymentConnection> {
    const response = await this.client.getPaymentHistoryWithTimeout({
      request: { userId: input.userId, page: input.page, pageSize: input.pageSize },
      timeoutMs: this.config.timeoutMs,
    });
    return mapSuperadminPaymentHistory({ response, request: input });
  }
}

import { Injectable } from '@nestjs/common';
import { PaymentGrpcClient } from '../../payments/infrastructure/payment-grpc.client';
import { SuperadminPaymentsConfig } from './superadmin-payments.config';
import { SuperadminPaymentsPageReader } from '../domain/superadmin-payments-page.port';
import type {
  SuperadminPaymentsFilter,
  SuperadminPaymentsReadPage,
} from '../../../../../../libs/common/types/superadmin-payments-list';
import { PAYMENT_LIST_SORT_TO_PROTO } from '../../../../../../libs/contracts/src/payment/superadmin-payments-enums';
import { mapSuperadminPaymentsPage } from './superadmin-payments-page.mapper';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
@Injectable()
export class GrpcSuperadminPaymentsPage extends SuperadminPaymentsPageReader {
  constructor(
    private readonly client: PaymentGrpcClient,
    private readonly config: SuperadminPaymentsConfig,
  ) {
    super();
  }
  async findPage(input: SuperadminPaymentsFilter): Promise<SuperadminPaymentsReadPage> {
    let response: unknown;
    try {
      response = await this.client.getSuperadminPaymentsPageWithTimeout({
        request: {
          page: input.page,
          searchUsername: input.searchUsername ?? undefined,
          sort: PAYMENT_LIST_SORT_TO_PROTO[input.sort],
        },
        timeoutMs: this.config.timeoutMs,
      });
    } catch (error: unknown) {
      if (error instanceof DomainException)
        throw new DomainException({
          code: DomainExceptionCode.ServiceUnavailable,
          message: 'Payments service unavailable',
        });
      throw error;
    }
    return mapSuperadminPaymentsPage({ response, page: input.page });
  }
}

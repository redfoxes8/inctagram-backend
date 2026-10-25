import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  validatePaymentProfileExportRequest,
  type PaymentProfileExportRequest,
  type PaymentProfileExportPage,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-export';

export abstract class IPaymentProfileExportQueryRepository {
  abstract exportPage(request: PaymentProfileExportRequest): Promise<PaymentProfileExportPage>;
}
export class ExportPaymentUserProfilesQuery {
  constructor(public readonly request: PaymentProfileExportRequest) {}
}
@QueryHandler(ExportPaymentUserProfilesQuery)
export class ExportPaymentUserProfilesHandler implements IQueryHandler<
  ExportPaymentUserProfilesQuery,
  PaymentProfileExportPage
> {
  constructor(private readonly repository: IPaymentProfileExportQueryRepository) {}
  async execute(query: ExportPaymentUserProfilesQuery): Promise<PaymentProfileExportPage> {
    try {
      validatePaymentProfileExportRequest(query.request);
    } catch {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid payment profile export input',
      });
    }
    return this.repository.exportPage(query.request);
  }
}

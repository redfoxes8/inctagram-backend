import type {
  SuperadminPaymentsFilter,
  SuperadminPaymentRecord,
} from '../../../../../../../libs/common/types/superadmin-payments-list';

export abstract class ISuperadminPaymentsQueryPort {
  abstract findPage(
    filter: SuperadminPaymentsFilter,
  ): Promise<{ items: SuperadminPaymentRecord[]; totalCount: number }>;
}

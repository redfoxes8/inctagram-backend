import type {
  SuperadminPaymentsFilter,
  SuperadminPaymentsReadPage,
} from '../../../../../../libs/common/types/superadmin-payments-list';
export abstract class SuperadminPaymentsPageReader {
  abstract findPage(input: SuperadminPaymentsFilter): Promise<SuperadminPaymentsReadPage>;
}

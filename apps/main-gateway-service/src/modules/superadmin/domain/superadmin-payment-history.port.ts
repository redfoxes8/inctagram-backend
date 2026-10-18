import type { SuperadminPaymentConnection } from '../../../../../../libs/common/types/superadmin-payments';

export type SuperadminPaymentHistoryInput = { userId: string; page: number; pageSize: number };

export abstract class SuperadminPaymentHistory {
  abstract getHistory(input: SuperadminPaymentHistoryInput): Promise<SuperadminPaymentConnection>;
}

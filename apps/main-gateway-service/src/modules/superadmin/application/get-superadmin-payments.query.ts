import { Injectable } from '@nestjs/common';
import {
  SuperadminPaymentHistory,
  type SuperadminPaymentHistoryInput,
} from '../domain/superadmin-payment-history.port';
import type { SuperadminPaymentConnection } from '../../../../../../libs/common/types/superadmin-payments';

@Injectable()
export class GetSuperadminPaymentsQuery {
  constructor(private readonly history: SuperadminPaymentHistory) {}

  execute(input: SuperadminPaymentHistoryInput): Promise<SuperadminPaymentConnection> {
    return this.history.getHistory(input);
  }
}

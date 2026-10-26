import type {
  PaymentProfileExportPage,
  PaymentProfileExportRequest,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-export';

export type PaymentProfileExportResult =
  | { outcome: 'SUCCESS'; page: PaymentProfileExportPage }
  | { outcome: 'UNAVAILABLE'; unimplemented: boolean };
export abstract class IPaymentProfileExportClient {
  abstract exportPage(request: PaymentProfileExportRequest): Promise<PaymentProfileExportResult>;
}
export abstract class IProjectionConsumerState {
  onConnected?: (listener: () => void) => () => void;
  abstract isConnected(): boolean;
}
export type ProjectionLease = Readonly<{
  owner: string;
  generation: bigint;
  request: PaymentProfileExportRequest;
}>;
export abstract class IProjectionBootstrapRepository {
  // Scheduling hint from the last claim; never substitutes API readiness checks.
  nextCheckAt = new Date(0);
  abstract claim(): Promise<ProjectionLease | null>;
  abstract complete(input: {
    lease: ProjectionLease;
    page: PaymentProfileExportPage;
    consumerConnected: () => boolean;
  }): Promise<void>;
  abstract retry(input: { lease: ProjectionLease; delaySeconds: number }): Promise<void>;
}

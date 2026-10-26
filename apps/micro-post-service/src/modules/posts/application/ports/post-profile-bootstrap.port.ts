import type {
  PaymentProfileExportPage,
  PaymentProfileExportRequest,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-export';

export type PostProfileExportResult =
  | Readonly<{ outcome: 'SUCCESS'; page: PaymentProfileExportPage }>
  | Readonly<{ outcome: 'UNAVAILABLE'; unimplemented: boolean }>;

export abstract class PostProfileExport {
  abstract exportPage(request: PaymentProfileExportRequest): Promise<PostProfileExportResult>;
}

export abstract class PostProfileConsumerState {
  onConnected?: (listener: () => void) => () => void;
  abstract isConnected(): boolean;
}

export type PostProjectionLease = Readonly<{
  owner: string;
  generation: bigint;
  request: PaymentProfileExportRequest;
}>;

export abstract class PostProjectionProgress {
  // Scheduling hint from the last claim; never substitutes API readiness checks.
  nextCheckAt = new Date(0);
  abstract claim(): Promise<PostProjectionLease | null>;
  abstract complete(input: {
    lease: PostProjectionLease;
    page: PaymentProfileExportPage;
    consumerConnected: () => boolean;
  }): Promise<void>;
  abstract retry(input: { lease: PostProjectionLease; delaySeconds: number }): Promise<void>;
}

import { JsonValue } from '../../domain/types/json-value.type';

export type PaymentOutboxClaimOptions = Readonly<{
  workerId: string;
  now: Date;
  staleBefore: Date;
  batchSize: number;
  maxAttempts: number;
}>;

export type ClaimedPaymentOutboxEvent = Readonly<{
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  routingKey: string;
  payload: JsonValue;
  attempts: number;
  occurredAt: Date;
}>;

export type PaymentOutboxFailureOptions = Readonly<{
  id: string;
  workerId: string;
  safeError: string;
  now: Date;
  maxAttempts: number;
  baseBackoffSeconds: number;
}>;

export abstract class IPaymentOutboxRelayRepository {
  abstract claim(options: PaymentOutboxClaimOptions): Promise<ClaimedPaymentOutboxEvent[]>;
  abstract markPublished(id: string, workerId: string, publishedAt: Date): Promise<boolean>;
  abstract markFailedOrRetry(options: PaymentOutboxFailureOptions): Promise<boolean>;
  abstract claimById(options: {
    id: string;
    workerId: string;
    now: Date;
  }): Promise<ClaimedPaymentOutboxEvent | null>;
}

export abstract class IPaymentOutboxPublisher {
  abstract publish(event: ClaimedPaymentOutboxEvent): Promise<void>;
  abstract close(): Promise<void>;
}

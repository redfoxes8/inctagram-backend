import { JsonValue } from '../../domain/types/json-value.type';

export type PendingPaymentOutboxEvent = Readonly<{
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  routingKey: string;
  payload: JsonValue;
  occurredAt: Date;
}>;

export abstract class IPaymentOutboxWriter {
  abstract insert(event: PendingPaymentOutboxEvent): Promise<void>;
}

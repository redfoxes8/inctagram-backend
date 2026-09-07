import { OutboxStatus, Prisma } from '../../../../core/prisma/client';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentIntegrationEventV1 } from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';
import { PaymentNotificationRequestedV1 } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { IPaymentOutboxWriter } from '../../application/ports/payment-outbox-writer.port';
import {
  serializePaymentIntegrationEvent,
  serializePaymentNotificationRequestedEvent,
} from '../../application/services/payment-integration-event.serializer';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

export class PaymentOutboxWriter implements IPaymentOutboxWriter {
  private constructor(private readonly transaction: PaymentPrismaClient) {}

  public static forTransaction(transaction: PaymentPrismaClient): PaymentOutboxWriter {
    return new PaymentOutboxWriter(transaction);
  }

  public async write(
    event: PaymentIntegrationEventV1 | PaymentNotificationRequestedV1,
  ): Promise<void> {
    const serialized =
      event.eventType === 'payment.notification.requested.v1'
        ? serializePaymentNotificationRequestedEvent(event)
        : serializePaymentIntegrationEvent(event);
    try {
      await this.transaction.outboxEvent.create({
        data: {
          id: serialized.id,
          aggregateType: serialized.aggregateType,
          aggregateId: serialized.aggregateId,
          eventType: serialized.eventType,
          eventVersion: serialized.eventVersion,
          routingKey: serialized.routingKey,
          payload: PaymentPrismaMapper.jsonToPrisma(serialized.payload),
          status: OutboxStatus.PENDING,
          attempts: 0,
          availableAt: serialized.occurredAt,
          occurredAt: serialized.occurredAt,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainException({
          code: DomainExceptionCode.Conflict,
          message: 'Payment integration event already exists',
        });
      }
      if (error instanceof DomainException) throw error;
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Payment integration event could not be stored',
      });
    }
  }
  public async writeMany(events: PaymentNotificationRequestedV1[]): Promise<number> {
    if (events.length === 0) return 0;
    const serialized = events.map(serializePaymentNotificationRequestedEvent);
    try {
      const result = await this.transaction.outboxEvent.createMany({
        data: serialized.map((event) => ({
          id: event.id,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          routingKey: event.routingKey,
          payload: PaymentPrismaMapper.jsonToPrisma(event.payload),
          status: OutboxStatus.PENDING,
          attempts: 0,
          availableAt: event.occurredAt,
          occurredAt: event.occurredAt,
        })),
      });
      return result.count;
    } catch {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Payment integration events could not be stored',
      });
    }
  }
}

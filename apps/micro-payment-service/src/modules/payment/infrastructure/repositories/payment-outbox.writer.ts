import { OutboxStatus, Prisma } from '../../../../core/prisma/client';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentIntegrationEventV1 } from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';
import { IPaymentOutboxWriter } from '../../application/ports/payment-outbox-writer.port';
import { serializePaymentIntegrationEvent } from '../../application/services/payment-integration-event.serializer';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

export class PaymentOutboxWriter implements IPaymentOutboxWriter {
  private constructor(private readonly transaction: PaymentPrismaClient) {}

  public static forTransaction(transaction: PaymentPrismaClient): PaymentOutboxWriter {
    return new PaymentOutboxWriter(transaction);
  }

  public async write(event: PaymentIntegrationEventV1): Promise<void> {
    const serialized = serializePaymentIntegrationEvent(event);
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
}

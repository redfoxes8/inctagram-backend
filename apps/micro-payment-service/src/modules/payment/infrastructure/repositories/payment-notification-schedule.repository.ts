import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentNotificationScheduleStatus as PrismaPaymentNotificationScheduleStatus,
  PaymentNotificationScheduleType as PrismaPaymentNotificationScheduleType,
} from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PaymentNotificationType } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { PaymentNotificationScheduleStatus } from '../../domain/enums/payment-notification-schedule-status.enum';
import {
  CreatePaymentNotificationScheduleInput,
  IPaymentNotificationScheduleRepository,
  IPaymentNotificationRecoveryRepository,
  PendingPaymentNotificationSchedule,
  PaymentNotificationScheduleDuplicateConstraintError,
} from '../../domain/interfaces/payment-notification-schedule.repository.interface';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

@Injectable()
export class PaymentNotificationScheduleRepository implements IPaymentNotificationScheduleRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public static forTransaction(
    transaction: PaymentPrismaClient,
  ): PaymentNotificationScheduleRepository {
    return new PaymentNotificationScheduleRepository(transaction);
  }

  public async findBySourceTransactionId(
    sourceTransactionId: string,
  ): Promise<PendingPaymentNotificationSchedule | null> {
    const source = await this.prisma.paymentNotificationScheduleSource.findUnique({
      where: { sourceTransactionId },
      include: { schedule: true },
    });
    return source ? this.toSchedule(source.schedule) : null;
  }

  public async findPendingByUserAndType(
    userId: string,
    notificationType: 'SUBSCRIPTION_ACTIVATED' | 'SUBSCRIPTION_EXTENDED',
  ): Promise<PendingPaymentNotificationSchedule | null> {
    const schedule = await this.prisma.paymentNotificationSchedule.findFirst({
      where: {
        userId,
        notificationType: this.toPrismaType(notificationType),
        status: PrismaPaymentNotificationScheduleStatus.PENDING,
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
    return schedule ? this.toSchedule(schedule) : null;
  }

  public async create(
    input: CreatePaymentNotificationScheduleInput,
  ): Promise<PendingPaymentNotificationSchedule> {
    try {
      const schedule = await this.prisma.paymentNotificationSchedule.create({
        data: {
          userId: input.userId,
          notificationType: this.toPrismaType(input.notificationType),
          businessKey: input.businessKey,
          sourceSubscriptionId: input.sourceSubscriptionId,
          effectiveAt: input.effectiveAt,
          subscriptionEndsAt: input.subscriptionEndsAt,
          dueAt: input.dueAt,
          sources: { create: { sourceTransactionId: input.sourceTransactionId } },
        },
      });
      return this.toSchedule(schedule);
    } catch (error: unknown) {
      throw this.mapDuplicateConstraint(error);
    }
  }

  public async mergePaidHorizon(input: {
    scheduleId: string;
    sourceTransactionId: string;
    subscriptionEndsAt: Date;
  }): Promise<PendingPaymentNotificationSchedule> {
    try {
      const schedule = await this.prisma.paymentNotificationSchedule.update({
        where: { id: input.scheduleId },
        data: {
          subscriptionEndsAt: input.subscriptionEndsAt,
          sources: { create: { sourceTransactionId: input.sourceTransactionId } },
        },
      });
      return this.toSchedule(schedule);
    } catch (error: unknown) {
      throw this.mapDuplicateConstraint(error);
    }
  }

  public async findById(id: string): Promise<PendingPaymentNotificationSchedule | null> {
    const schedule = await this.prisma.paymentNotificationSchedule.findUnique({ where: { id } });
    return schedule ? this.toSchedule(schedule) : null;
  }

  public async claim(id: string, now: Date): Promise<boolean> {
    const result = await this.prisma.paymentNotificationSchedule.updateMany({
      where: {
        id,
        status: {
          in: [
            PrismaPaymentNotificationScheduleStatus.PENDING,
            PrismaPaymentNotificationScheduleStatus.FAILED,
          ],
        },
        dueAt: { lte: now },
      },
      data: { status: PrismaPaymentNotificationScheduleStatus.PROCESSING },
    });
    return result.count === 1;
  }

  public async complete(id: string, subscriptionEndsAt: Date): Promise<void> {
    await this.prisma.paymentNotificationSchedule.update({
      where: { id },
      data: {
        status: PrismaPaymentNotificationScheduleStatus.COMPLETED,
        subscriptionEndsAt,
        processedAt: new Date(),
      },
    });
  }

  public async cancel(id: string): Promise<void> {
    await this.prisma.paymentNotificationSchedule.update({
      where: { id },
      data: { status: PrismaPaymentNotificationScheduleStatus.CANCELLED, processedAt: new Date() },
    });
  }

  private toSchedule(record: {
    id: string;
    userId: string;
    notificationType: PrismaPaymentNotificationScheduleType;
    businessKey: string;
    sourceSubscriptionId: string | null;
    effectiveAt: Date;
    subscriptionEndsAt: Date | null;
    dueAt: Date;
    status: PrismaPaymentNotificationScheduleStatus;
  }): PendingPaymentNotificationSchedule {
    return {
      id: record.id,
      userId: record.userId,
      notificationType: record.notificationType as PaymentNotificationType,
      businessKey: record.businessKey,
      sourceSubscriptionId: record.sourceSubscriptionId,
      effectiveAt: record.effectiveAt,
      subscriptionEndsAt: record.subscriptionEndsAt,
      dueAt: record.dueAt,
      status: record.status as PaymentNotificationScheduleStatus,
    };
  }

  private toPrismaType(
    notificationType: 'SUBSCRIPTION_ACTIVATED' | 'SUBSCRIPTION_EXTENDED',
  ): PrismaPaymentNotificationScheduleType {
    return notificationType === PaymentNotificationType.SUBSCRIPTION_ACTIVATED
      ? PrismaPaymentNotificationScheduleType.SUBSCRIPTION_ACTIVATED
      : PrismaPaymentNotificationScheduleType.SUBSCRIPTION_EXTENDED;
  }

  private mapDuplicateConstraint(error: unknown): unknown {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'P2002') return error;
    const target = 'meta' in error ? JSON.stringify(error.meta) : '';
    if (target.includes('payment_notification_schedule_sources')) {
      return new PaymentNotificationScheduleDuplicateConstraintError('SOURCE_TRANSACTION');
    }
    if (target.includes('payment_notification_schedules_business_key')) {
      return new PaymentNotificationScheduleDuplicateConstraintError('BUSINESS_KEY');
    }
    return error;
  }
}

@Injectable()
export class PaymentNotificationRecoveryRepository implements IPaymentNotificationRecoveryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async findDueIds(input: { now: Date; limit: number }): Promise<string[]> {
    const rows = await this.prisma.paymentNotificationSchedule.findMany({
      where: {
        status: {
          in: [
            PrismaPaymentNotificationScheduleStatus.PENDING,
            PrismaPaymentNotificationScheduleStatus.FAILED,
          ],
        },
        dueAt: { lte: input.now },
      },
      select: { id: true },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
    });
    return rows.map((row) => row.id);
  }
}

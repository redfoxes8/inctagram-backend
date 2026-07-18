import { Controller, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { SendPaymentSucceededEmailCommand } from '../../application/commands/send-payment-succeeded-email.command';
import { SendPaymentFailedEmailCommand } from '../../application/commands/send-payment-failed-email.command';
import { SendSubscriptionExpiredEmailCommand } from '../../application/commands/send-subscription-expired-email.command';
import { PaymentSucceededEmailSentDto } from './dto/payment-succeeded-email-sent.dto';
import { PaymentFailedDto } from './dto/payment-failed.dto';
import { PaymentSubscriptionExpiredDto } from './dto/payment-subscription-expired.dto';
import {
  PAYMENT_SUCCEEDED_ROUTING_KEY,
  PAYMENT_FAILED_ROUTING_KEY,
  PAYMENT_SUBSCRIPTION_EXPIRED_ROUTING_KEY,
} from '../../../../../../../libs/contracts/src';

@Controller()
export class PaymentEventsConsumer {
  private readonly logger = new Logger(PaymentEventsConsumer.name);

  constructor(private readonly commandBus: CommandBus) {}

  @EventPattern(PAYMENT_SUCCEEDED_ROUTING_KEY)
  async handlePaymentSucceeded(
    @Payload() dto: PaymentSucceededEmailSentDto,
    @Ctx() context: RmqContext,
  ) {
    try {
      await this.commandBus.execute(
        new SendPaymentSucceededEmailCommand(
          dto.userId,
          dto.subscriptionId,
          dto.amount,
          dto.currency,
        ),
      );

      context.getChannelRef().ack(context.getMessage());
    } catch (error) {
      this.logger.error(
        'Error processing PaymentSucceededEmailSent event',
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  @EventPattern(PAYMENT_FAILED_ROUTING_KEY)
  async handlePaymentFailed(@Payload() dto: PaymentFailedDto, @Ctx() context: RmqContext) {
    try {
      await this.commandBus.execute(new SendPaymentFailedEmailCommand(dto.userId));

      context.getChannelRef().ack(context.getMessage());
    } catch (error) {
      this.logger.error(
        `Failed to process payment.failed event for user ${dto.userId}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  @EventPattern(PAYMENT_SUBSCRIPTION_EXPIRED_ROUTING_KEY)
  async handleSubscriptionExpired(
    @Payload() dto: PaymentSubscriptionExpiredDto,
    @Ctx() context: RmqContext,
  ) {
    try {
      await this.commandBus.execute(
        new SendSubscriptionExpiredEmailCommand(dto.userId, dto.subscriptionId),
      );

      context.getChannelRef().ack(context.getMessage());
    } catch (error) {
      this.logger.error(
        `Failed to process payment.subscription.expired event for user ${dto.userId}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }
}

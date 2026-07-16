import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

import {
  type IPaymentSucceededEvent,
  type IPaymentSubscriptionExpiredEvent,
  PAYMENT_EVENTS_EXCHANGE,
  PAYMENT_SUCCEEDED_ROUTING_KEY,
  PAYMENT_SUBSCRIPTION_EXPIRED_ROUTING_KEY,
} from '../../../../../../libs/contracts/src';

import { UpdateAccountTypeCommand } from '../application/commands/update-account-type.command';
import { AccountType } from '../../../core/prisma/client';

@Injectable()
export class PaymentRabbitConsumer {
  private readonly logger = new Logger(PaymentRabbitConsumer.name);

  constructor(private readonly commandBus: CommandBus) {}

  @RabbitSubscribe({
    exchange: PAYMENT_EVENTS_EXCHANGE,
    routingKey: PAYMENT_SUCCEEDED_ROUTING_KEY,
    queue: 'gateway_payment_queue',
  })
  async handlePaymentSucceeded(event: IPaymentSucceededEvent): Promise<Nack | void> {
    try {
      this.logger.log(
        `[Rabbit] payment.succeeded userId=${event.userId} subscriptionId=${event.subscriptionId}`,
      );

      await this.commandBus.execute(
        new UpdateAccountTypeCommand({
          userId: event.userId,
          accountType: AccountType.BUSINESS,
        }),
      );
    } catch (e) {
      this.logger.error(e);

      return new Nack(false);
    }
  }

  @RabbitSubscribe({
    exchange: PAYMENT_EVENTS_EXCHANGE,
    routingKey: PAYMENT_SUBSCRIPTION_EXPIRED_ROUTING_KEY,
    queue: 'gateway_payment_queue',
  })
  async handleSubscriptionExpired(event: IPaymentSubscriptionExpiredEvent): Promise<Nack | void> {
    try {
      this.logger.log(
        `[Rabbit] payment.subscription.expired userId=${event.userId} subscriptionId=${event.subscriptionId}`,
      );

      await this.commandBus.execute(
        new UpdateAccountTypeCommand({
          userId: event.userId,
          accountType: AccountType.PERSONAL,
        }),
      );
    } catch (e) {
      this.logger.error(e);

      return new Nack(false);
    }
  }
}

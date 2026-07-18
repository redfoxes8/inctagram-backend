import { SendEmailParams } from '../../../../application/interfaces/mail-adapter.interface';
import {
  NOTIFICATION_MESSAGE_REGISTRY,
  NotificationEvents,
} from '../../../../core/notification.constants';
import { UserGrpcDto } from '../../infrastructure/grpc/user/dto/user-grpc.dto';
import { SendPaymentSucceededEmailCommand } from '../commands/send-payment-succeeded-email.command';
import { SendSubscriptionExpiredEmailCommand } from '../commands/send-subscription-expired-email.command';

export class NotificationMessageFactory {
  static buildPaymentSucceededMessage(
    user: UserGrpcDto,
    command: SendPaymentSucceededEmailCommand,
  ): SendEmailParams {
    const settings = NOTIFICATION_MESSAGE_REGISTRY[NotificationEvents.PaymentSucceededEmailSent];

    return {
      to: user.email,
      subject: settings.subject,
      template: settings.template,
      context: {
        username: user.username,
        amount: command.amount,
        currency: command.currency,
        subscriptionId: command.subscriptionId,
      },
    };
  }

  static buildPaymentFailedMessage(user: UserGrpcDto): SendEmailParams {
    const settings = NOTIFICATION_MESSAGE_REGISTRY[NotificationEvents.PaymentFailedEmailSent];

    return {
      to: user.email,
      subject: settings.subject,
      template: settings.template,
      context: {
        username: user.username,
      },
    };
  }

  static buildSubscriptionExpiredMessage(
    user: UserGrpcDto,
    command: SendSubscriptionExpiredEmailCommand,
  ): SendEmailParams {
    const settings = NOTIFICATION_MESSAGE_REGISTRY[NotificationEvents.SubscriptionExpiredEmailSent];

    return {
      to: user.email,
      subject: settings.subject,
      template: settings.template,
      context: {
        username: user.username,
        subscriptionId: command.subscriptionId,
      },
    };
  }
}

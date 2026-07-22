import { Injectable, Logger } from '@nestjs/common';
import {
  ApiResponse,
  Client,
  Environment,
  LinkDescription,
  SubscriptionsController,
  Subscription,
  TenureType,
  CycleExecution,
} from '@paypal/paypal-server-sdk';
import { PaymentConfig } from '../../../../core/payment.config';
import { UserInfoForProviderType } from './user-info.type';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { CreateCheckoutResponseType } from '../../domain/types/create-checkout-respone.type';
import { IPaymentProvider } from '../../domain/interfaces/payment.provider.interface';

@Injectable()
export class PaypalProvider implements IPaymentProvider {
  private readonly client: Client;
  private readonly subscriptionController: SubscriptionsController;
  private readonly logger: Logger;
  constructor(private readonly config: PaymentConfig) {
    this.client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: config.paypalClientId,
        oAuthClientSecret: config.paypalClientSecret,
      },
      environment: Environment.Sandbox,
    });
    this.subscriptionController = new SubscriptionsController(this.client);
    this.logger = new Logger(PaypalProvider.name);
  }

  private async getSubscriptionDetails(subscriptionId: string): Promise<ApiResponse<Subscription>> {
    return await this.subscriptionController.getSubscription({ id: subscriptionId });
  }

  async createCheckOutSession(
    planId: string,
    userInfo: UserInfoForProviderType,
  ): Promise<CreateCheckoutResponseType | false> {
    try {
      const result: ApiResponse<Subscription> =
        await this.subscriptionController.createSubscription({
          body: {
            planId: planId,
            customId: userInfo.providerUserId,
            subscriber: {
              emailAddress: userInfo.email,
              name: {
                givenName: userInfo.firstName ?? undefined,
                surname: userInfo.lastName ?? undefined,
              },
            },
            applicationContext: {
              returnUrl: this.config.successPaymentUrl,
              cancelUrl: this.config.unsuccessPaymentUrl,
            },
          },
        });
      if (!Array.isArray(result.result.links)) {
        throw new DomainException({
          code: DomainExceptionCode.InternalServerError,
          message: 'Invalid format of link prop in PayPal subscription creation response',
        });
      }

      const link: LinkDescription | undefined = result.result.links.find(
        (link) => link.rel === 'approve',
      );
      if (!link?.href) {
        throw new DomainException({
          code: DomainExceptionCode.InternalServerError,
          message: 'PayPal link for checkout was not found',
        });
      }

      if (!result.result.id) {
        throw new DomainException({
          code: DomainExceptionCode.InternalServerError,
          message: 'PayPal subscription id was not found',
        });
      }
      return { link: link.href, providerSubscriptionId: result.result.id };
    } catch (e) {
      this.logger.error({
        message: `PayPal provider error on CreateCheckOutSession: ${e}`,
      });
      return false;
    }
  }

  async cancelSubscriptionAtEndOfPeriod(providerSubscriptionId: string): Promise<boolean> {
    try {
      // Getting subscription details
      const subscriptionDetails: ApiResponse<Subscription> =
        await this.getSubscriptionDetails(providerSubscriptionId);

      // Getting info about cycles of REGULAR (not TRIAL) subscription
      const regularCycle: CycleExecution | undefined =
        subscriptionDetails.result.billingInfo?.cycleExecutions?.find(
          (cycle) => cycle.tenureType === TenureType.Regular,
        );

      // Getting amount of completed cycles of REGULAR subscription
      const completedCycles: number = regularCycle?.cyclesCompleted || 1;

      // Update current plan for this user ( max available cycles = completed cycles of subscription )
      await this.subscriptionController.reviseSubscription({
        id: providerSubscriptionId,
        body: {
          plan: {
            billingCycles: [
              {
                sequence: 1,
                totalCycles: completedCycles,
              },
            ],
          },
        },
      });
      return true;
    } catch (e) {
      this.logger.error({
        message: `PayPal provider error on CancelSubscriptionAtEndOfPeriod: ${e}`,
      });
      return false;
    }
  }

  async disableCancelingAtTheEndOfPeriod(providerSubscriptionId: string): Promise<boolean> {
    try {
      // Getting subscription details
      const subscriptionDetails: ApiResponse<Subscription> =
        await this.getSubscriptionDetails(providerSubscriptionId);

      // Getting info about cycles of REGULAR (not TRIAL) subscription
      const regularCycle: CycleExecution | undefined =
        subscriptionDetails.result.billingInfo?.cycleExecutions?.find(
          (cycle) => cycle.tenureType === TenureType.Regular,
        );

      // Update current plan for this user ( max available cycles = 0 (infinity))
      await this.subscriptionController.reviseSubscription({
        id: providerSubscriptionId,
        body: {
          plan: {
            billingCycles: [
              {
                sequence: regularCycle?.sequence || 1,
                totalCycles: 0,
              },
            ],
          },
        },
      });
      return true;
    } catch (e) {
      this.logger.error({
        message: `PayPal provider error on DisableCancelingAtTheEndOfPeriod: ${e}`,
      });
      return false;
    }
  }
}

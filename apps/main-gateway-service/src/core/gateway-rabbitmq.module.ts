import { DynamicModule, Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { GatewayConfig } from './gateway.config';
import {
  PAYMENT_ENTITLEMENT_DLQ_NAME,
  PAYMENT_ENTITLEMENT_DLQ_ROUTING_KEY,
  PAYMENT_ENTITLEMENT_RETRY_DELAY_ROUTING_KEY,
  PAYMENT_ENTITLEMENT_RETRY_QUEUE_NAME,
  PAYMENT_ENTITLEMENT_RETRY_READY_ROUTING_KEY,
} from '../modules/users/infrastructure/payment.rabbit.consumer';
import { COMMON_RABBITMQ_EXCHANGE } from './gateway-rabbitmq.constants';

@Module({})
export class GatewayRabbitMqModule {
  public static forRoot(config: GatewayConfig): DynamicModule {
    return {
      module: GatewayRabbitMqModule,
      imports: [
        RabbitMQModule.forRoot({
          exchanges: [
            {
              name: COMMON_RABBITMQ_EXCHANGE,
              type: 'topic',
            },
          ],
          uri: config.rabbitmqUrl,
          queues: [
            {
              name: PAYMENT_ENTITLEMENT_RETRY_QUEUE_NAME,
              options: {
                durable: true,
                arguments: {
                  'x-dead-letter-exchange': COMMON_RABBITMQ_EXCHANGE,
                  'x-dead-letter-routing-key': PAYMENT_ENTITLEMENT_RETRY_READY_ROUTING_KEY,
                },
              },
              exchange: COMMON_RABBITMQ_EXCHANGE,
              routingKey: PAYMENT_ENTITLEMENT_RETRY_DELAY_ROUTING_KEY,
            },
            {
              name: PAYMENT_ENTITLEMENT_DLQ_NAME,
              options: { durable: true },
              exchange: COMMON_RABBITMQ_EXCHANGE,
              routingKey: PAYMENT_ENTITLEMENT_DLQ_ROUTING_KEY,
            },
          ],
          connectionInitOptions: { wait: false },
        }),
      ],
      exports: [RabbitMQModule],
    };
  }
}

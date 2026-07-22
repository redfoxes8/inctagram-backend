import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsNotEmpty, IsNumber, IsString } from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class PaymentConfig {
  // General Configuration
  @IsNumber({}, { message: 'Env variable PORT must be a number' })
  @IsNotEmpty({ message: 'Set Env variable PORT, example: 3001' })
  port: number;

  @IsString({ message: 'Env variable SUCCESS_PAYMENT_URL must be a string' })
  @IsNotEmpty({
    message: 'Set Env variable SUCCESS_PAYMENT_URL, example: https://example.com/success',
  })
  successPaymentUrl: string;

  @IsString({ message: 'Env variable UNSECCESS_PAYMENT_URL must be a string' })
  @IsNotEmpty({
    message: 'Set Env variable UNSECCESS_PAYMENT_URL, example: https://example.com/success',
  })
  unsuccessPaymentUrl: string;

  // gRPC Configuration
  @IsString({ message: 'Env variable GRPC_HOST must be a string' })
  @IsNotEmpty({ message: 'Set Env variable GRPC_HOST, example: 0.0.0.0' })
  grpcHost: string;

  @IsNumber({}, { message: 'GRPC_PORT must be a number' })
  @IsNotEmpty({ message: 'Set Env variable GRPC_PORT, example: 00000' })
  grpcPort: number;

  // Database Configuration
  @IsString({ message: 'Env variable DATABASE_URL must be a string' })
  @IsNotEmpty({ message: 'Set Env variable DATABASE_URL, example: http://xxxx' })
  databaseUrl: string;

  // Prisma Configuration
  @IsString({ message: 'PRISMA_DB_URL must be a string' })
  @IsNotEmpty({ message: 'Set Env variable PRISMA_DB_URL, example: postgres://xxxxxx' })
  prismaDbUrl: string;

  // RabbitMQ Configuration
  @IsString({ message: 'Env variable RABBITMQ_URL must be a string' })
  @IsNotEmpty({
    message: 'Set Env variable RABBITMQ_URL, example: amqps://xxxxx',
  })
  rabbitUrl: string;

  // Stripe Configuration
  @IsString({ message: 'Env variable STRIPE_SECRET_KEY must be a string' })
  @IsNotEmpty({ message: 'Set Env variable STRIPE_SECRET_KEY, example: xxx123' })
  stripeSecretKey: string;

  @IsString({ message: 'Env variable STRIPE_WEBHOOK_SECRET must be a string' })
  @IsNotEmpty({ message: 'Set Env variable STRIPE_WEBHOOK_SECRET, example: xxx123' })
  stripeWebhookSecret: string;

  // PayPal Configuration
  @IsString({ message: 'Env variable PAYPAL_CLIENT_ID must be a string' })
  @IsNotEmpty({ message: 'Set Env variable PAYPAL_CLIENT_ID, example: xxx123' })
  paypalClientId: string;

  @IsString({ message: 'Env variable PAYPAL_CLIENT_SECRET must be a string' })
  @IsNotEmpty({ message: 'Set Env variable PAYPAL_CLIENT_SECRET, example: xxx123' })
  paypalClientSecret: string;

  @IsString({ message: 'Env variable PAYPAL_WEBHOOK_ID must be a string' })
  @IsNotEmpty({ message: 'Set Env variable PAYPAL_WEBHOOK_ID, example: xxx123' })
  paypalWebhookId: string;

  @IsIn(['sandbox', 'live'], { message: "Env variable PAYPAL_MODE must be in ['sandbox', 'live']" })
  @IsNotEmpty({ message: 'Set Env variable PAYPAL_MODE, example: sandbox' })
  paypalMode: string;

  // ?? Configuration
  @IsString({ message: 'Env variable SUBSCRIPTION_CHECK_CRON must be a string' })
  @IsNotEmpty({ message: 'Set Env variable SUBSCRIPTION_CHECK_CRON, example: xxx123' })
  subscriptionCheckCron: string;

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    this.port = Number(this.configService.get('PORT'));

    this.successPaymentUrl = this.configService.get('SUCCESS_PAYMENT_URL');

    this.unsuccessPaymentUrl = this.configService.get('UNSUCCESS_PAYMENT_URL');

    this.grpcHost = this.configService.get('GRPC_HOST');

    this.grpcPort = Number(this.configService.get('GRPC_PORT'));

    this.databaseUrl = this.configService.get('DATABASE_URL');

    this.prismaDbUrl = this.configService.get('PRISMA_DB_URL');

    this.rabbitUrl = this.configService.get('RABBITMQ_URL');

    this.stripeSecretKey = this.configService.get('STRIPE_SECRET_KEY');

    this.stripeWebhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');

    this.paypalClientId = this.configService.get('PAYPAL_CLIENT_ID');

    this.paypalClientSecret = this.configService.get('PAYPAL_CLIENT_SECRET');

    this.paypalWebhookId = this.configService.get('PAYPAL_WEBHOOK_ID');

    this.paypalMode = this.configService.get('PAYPAL_MODE');

    this.subscriptionCheckCron = this.configService.get('SUBSCRIPTION_CHECK_CRON');

    configValidationUtility.validateConfig(this);
  }
}

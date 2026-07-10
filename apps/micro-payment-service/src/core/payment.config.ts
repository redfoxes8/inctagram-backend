import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsNotEmpty, IsNumber, IsString } from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class PaymentConfig {
  @IsNumber({}, { message: 'Set Env variable PORT' })
  port: number;

  @IsString()
  @IsNotEmpty()
  grpcHost: string;

  @IsNumber()
  grpcPort: number;

  @IsString()
  @IsNotEmpty()
  databaseUrl: string;

  @IsString()
  @IsNotEmpty()
  rabbitUrl: string;

  @IsString()
  @IsNotEmpty()
  stripeSecretKey: string;

  @IsString()
  @IsNotEmpty()
  stripeWebhookSecret: string;

  @IsString()
  @IsNotEmpty()
  paypalClientId: string;

  @IsString()
  @IsNotEmpty()
  paypalClientSecret: string;

  @IsString()
  @IsNotEmpty()
  paypalWebhookId: string;

  @IsIn(['sandbox', 'live'])
  paypalMode: string;

  @IsString()
  @IsNotEmpty()
  subscriptionCheckCron: string;

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    this.port = Number(this.configService.get('PORT'));

    this.grpcHost = this.configService.get('GRPC_HOST');

    this.grpcPort = Number(this.configService.get('GRPC_PORT'));

    this.databaseUrl = this.configService.get('DATABASE_URL');

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

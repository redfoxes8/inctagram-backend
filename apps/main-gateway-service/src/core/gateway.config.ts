import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsBoolean, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class GatewayConfig {
  // General Configuration
  @IsNumber({}, { message: 'Set Env variable PORT, example: 3000' })
  port: number;

  @IsBoolean({ message: 'INCLUDE_TESTING_MODULE must be a boolean value' })
  @IsNotEmpty({ message: 'Set Env variable INCLUDE_TESTING_MODULE, example: false' })
  includeTestingModule: boolean;

  @IsNotEmpty({ message: 'Set Env variable FRONTEND_URL, example: https://inctagram.com' })
  frontEndUrl: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable FILES_SERVICE_URL, example: http://localhost:3001' })
  filesServiceUrl: string;

  // Prisma Configuration
  @IsNotEmpty({ message: 'Set Env variable PRISMA_DB_URL, example: postgres://xxxxxx' })
  prismaDbUrl: string;

  // gRPC Configuration
  @IsString()
  @IsNotEmpty({ message: 'Set Env variable POST_SERVICE_GRPC_URL, example: localhost:50051' })
  postServiceGrpcUrl: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable FILE_SERVICE_GRPC_URL, example: localhost:50052' })
  fileServiceGrpcUrl: string;

  // JWT Configuration
  @IsNotEmpty({ message: 'Set Env variable JWT_SECRET' })
  jwtSecret: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1, { message: 'Set Env variable ACCESS_TOKEN_EXPIRE_TIME in seconds, example: 60' })
  accessTokenExpTime: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1, { message: 'Set Env variable REFRESH_TOKEN_EXPIRE_TIME in seconds, example: 60' })
  refreshTokenExpTime: number;

  // RabbitMQ Configuration
  @IsString()
  @IsNotEmpty({ message: 'Set Env variable RABBITMQ_URL, example: amqp://localhost:5672' })
  rabbitmqUrl: string;

  @IsString()
  @IsNotEmpty({
    message: 'Set Env variable NOTIFICATION_QUEUE_NAME, example: micro-notification-service',
  })
  notificationQueueName: string;

  // OAuth Configuration
  @IsString()
  @IsNotEmpty({ message: 'Set Env variable GOOGLE_CLIENT_ID' })
  googleClientId: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable GOOGLE_CLIENT_SECRET' })
  googleClientSecret: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable GOOGLE_REDIRECT_URI' })
  googleRedirectUri: string;

  // reCAPTCHA Configuration
  @IsNotEmpty({ message: 'Set Env variable RECAPTCHA_SECRET' })
  recaptchaSecret: string;

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    // General Configuration
    this.port = Number(this.configService.get('PORT'));
    this.includeTestingModule = configValidationUtility.convertToBoolean(
      this.configService.get('INCLUDE_TESTING_MODULE'),
    );
    this.filesServiceUrl = this.configService.get('FILES_SERVICE_URL');
    this.frontEndUrl = this.configService.get('FRONTEND_URL');

    // Prisma Configuration
    this.prismaDbUrl = this.configService.get('PRISMA_DB_URL');

    // gRPC Configuration
    this.postServiceGrpcUrl = this.configService.get('POST_SERVICE_GRPC_URL');
    this.fileServiceGrpcUrl = this.configService.get('FILE_SERVICE_GRPC_URL');

    // JWT Configuration
    this.jwtSecret = this.configService.get('JWT_SECRET');
    this.accessTokenExpTime = Number(this.configService.get('ACCESS_TOKEN_EXPIRE_TIME'));
    this.refreshTokenExpTime = Number(this.configService.get('REFRESH_TOKEN_EXPIRE_TIME'));

    // RabbitMQ Configuration
    this.rabbitmqUrl = this.configService.get('RABBITMQ_URL');
    this.notificationQueueName = this.configService.get('NOTIFICATION_QUEUE_NAME');

    // OAuth Configuration
    this.googleClientId = this.configService.get('GOOGLE_CLIENT_ID');
    this.googleClientSecret = this.configService.get('GOOGLE_CLIENT_SECRET');
    this.googleRedirectUri = this.configService.get('GOOGLE_REDIRECT_URI');

    // reCAPTCHA Configuration
    this.recaptchaSecret = this.configService.get('RECAPTCHA_SECRET');

    configValidationUtility.validateConfig(this);
  }
}

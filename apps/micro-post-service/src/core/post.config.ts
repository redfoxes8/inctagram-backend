import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsBoolean, IsNotEmpty, IsNumber, IsString } from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class PostConfig {
  @IsNumber({}, { message: 'Set Env variable PORT, example: 3004' })
  port: number;

  @IsString({ message: 'GRPC_HOST must be a string' })
  @IsNotEmpty({ message: 'Set Env variable GRPC_HOST, example: 0.0.0.0' })
  grpcHost: string;

  @IsNumber({}, { message: 'GRPC_PORT must be a number' })
  grpcPort: number;

  @IsString({ message: 'DATABASE_URL must be a string' })
  @IsNotEmpty({ message: 'Set Env variable DATABASE_URL' })
  databaseUrl: string;

  @IsString()
  @IsNotEmpty({ message: 'RABBITMQ_URL must be set' })
  rabbitUrl: string;

  @IsBoolean()
  userProjectionSyncEnabled: boolean;

  readonly gatewayUserServiceGrpcUrl: string | null;

  @IsString({ message: 'FILE_SERVICE_GRPC_URL must be a string' })
  @IsNotEmpty({ message: 'Set Env variable FILE_SERVICE_GRPC_URL' })
  fileServiceGrpcUrl: string;

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    this.port = Number(this.configService.get('PORT'));
    this.grpcHost = this.configService.get('GRPC_HOST') || '0.0.0.0';
    this.grpcPort = Number(this.configService.get('GRPC_PORT'));
    this.databaseUrl = this.configService.get('DATABASE_URL');
    this.fileServiceGrpcUrl = this.configService.get('FILE_SERVICE_GRPC_URL') || 'localhost:50052';
    this.rabbitUrl = this.configService.get('RABBITMQ_URL') || '';
    const syncEnabled = this.configService.get('POST_USER_PROJECTION_SYNC_ENABLED') ?? 'false';
    if (syncEnabled.trim() !== 'true' && syncEnabled.trim() !== 'false') {
      throw new Error('POST_USER_PROJECTION_SYNC_ENABLED must be true or false');
    }
    this.userProjectionSyncEnabled = syncEnabled.trim() === 'true';
    this.gatewayUserServiceGrpcUrl =
      this.configService.get('GATEWAY_USER_SERVICE_GRPC_URL')?.trim() || null;
    if (this.userProjectionSyncEnabled) {
      try {
        const address = new URL(this.rabbitUrl);
        if (address.protocol !== 'amqp:' && address.protocol !== 'amqps:') throw new Error();
      } catch {
        throw new Error('RABBITMQ_URL must be a valid AMQP URL when Post profile sync is enabled');
      }
      const address = this.gatewayUserServiceGrpcUrl;
      if (!address || !/^(?:\[[0-9a-fA-F:]+\]|[^\s/:?#@]+):\d+$/.test(address)) {
        throw new Error('GATEWAY_USER_SERVICE_GRPC_URL must be a private host:port');
      }
      const port = Number(address.slice(address.lastIndexOf(':') + 1));
      if (port < 1 || port > 65535) {
        throw new Error('GATEWAY_USER_SERVICE_GRPC_URL must contain a valid port');
      }
    }

    configValidationUtility.validateConfig(this);
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

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

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    this.port = Number(this.configService.get('PORT'));
    this.grpcHost = this.configService.get('GRPC_HOST') || '0.0.0.0';
    this.grpcPort = Number(this.configService.get('GRPC_PORT'));

    configValidationUtility.validateConfig(this);
  }
}

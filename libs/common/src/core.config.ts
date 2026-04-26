import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum } from 'class-validator';
import { configValidationUtility } from './utils/config-validation.utility';

export enum Environments {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test',
}

@Injectable()
export class CoreConfig {
  @IsEnum(Environments, {
    message:
      'Set correct NODE_ENV value, available values: ' +
      configValidationUtility.getEnumValues(Environments).join(', '),
  })
  env: string;

  constructor(private configService: ConfigService<any, true>) {
    this.env = this.configService.get('NODE_ENV');

    configValidationUtility.validateConfig(this);
  }
}

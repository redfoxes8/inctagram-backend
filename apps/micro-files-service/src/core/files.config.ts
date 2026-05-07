import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsBoolean, IsNotEmpty, IsNumber, IsString } from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class FilesConfig {
  @IsNumber({}, { message: 'Set Env variable PORT, example: 3001' })
  port: number;

  @IsBoolean({ message: 'INCLUDE_TESTING_MODULE must be a boolean value' })
  @IsNotEmpty({ message: 'Set Env variable INCLUDE_TESTING_MODULE, example: false' })
  includeTestingModule: boolean;

  @IsString({ message: 'POST_SERVICE_GRPC_URL must be a string' })
  postServiceGrpcUrl: string;

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    this.port = Number(this.configService.get('PORT'));
    this.includeTestingModule = configValidationUtility.convertToBoolean(
      this.configService.get('INCLUDE_TESTING_MODULE'),
    );
    this.postServiceGrpcUrl = this.configService.get('POST_SERVICE_GRPC_URL') || '0.0.0.0:50051';

    configValidationUtility.validateConfig(this);
  }
}

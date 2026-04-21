import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNotEmpty, IsNumber, IsBoolean, IsString } from 'class-validator';
import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class GatewayConfig {
  @IsNumber({}, { message: 'Set Env variable PORT, example: 3000' })
  port: number;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable FILES_SERVICE_URL, example: http://localhost:3001' })
  filesServiceUrl: string;

  @IsBoolean({ message: 'INCLUDE_TESTING_MODULE must be a boolean value' })
  @IsNotEmpty({ message: 'Set Env variable INCLUDE_TESTING_MODULE, example: false' })
  includeTestingModule: boolean;

  @IsNotEmpty({ message: 'Set Env variable PRISMA_DB_URL, example: postgres://xxxxxx' })
  prismaUrl: string;

  constructor(private configService: ConfigService<any, true>) {
    this.port = Number(this.configService.get('PORT'));
    this.filesServiceUrl = this.configService.get('FILES_SERVICE_URL');
    this.prismaUrl = this.configService.get('PRISMA_DB_URL');
    this.includeTestingModule = configValidationUtility.convertToBoolean(
      this.configService.get('INCLUDE_TESTING_MODULE'),
    );

    configValidationUtility.validateConfig(this);
  }
}

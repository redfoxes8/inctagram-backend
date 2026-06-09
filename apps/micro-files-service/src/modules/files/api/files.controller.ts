import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  GenerateUploadUrlRequest,
  GenerateUploadUrlResponse,
  GetFilesDataRequest,
  GetFilesDataResponse,
} from '../../../../../../libs/contracts/src/';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GenerateUrlForUploadCommand } from '../application/use-cases/generate-url-for-upload.use-case';
import { GetFilesDataQuery } from '../application/queries/get-files-data.query';
import { FileEntity } from '../domain/file.entity';
import { GrpcResponseMapper } from './mappers/grpc-response.mapper';
import { GenerateUrlForUploadDto } from '../application/use-cases/dto/generate-url-for-upload.dto';
import { GrpcRequestMapper } from './mappers/grpc-request.mapper';

@Controller()
export class FilesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @GrpcMethod('FileService', 'GenerateUploadUrl')
  async generateUploadUrl(data: GenerateUploadUrlRequest): Promise<GenerateUploadUrlResponse> {
    const dto: GenerateUrlForUploadDto = GrpcRequestMapper.generateUrlForUploadRequest(data);
    return await this.commandBus.execute(new GenerateUrlForUploadCommand(dto));
  }

  @GrpcMethod('FileService', 'GetFilesData')
  async getFilesData(data: GetFilesDataRequest): Promise<GetFilesDataResponse> {
    const result: FileEntity[] | null = await this.queryBus.execute(new GetFilesDataQuery(data));
    return GrpcResponseMapper.getFilesDataResponse(result);
  }
}

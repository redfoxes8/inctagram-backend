import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  GenerateUploadUrlRequest,
  GenerateUploadUrlResponse,
  GetFilesDataRequest,
  GetFilesDataResponse,
  GetFileStatusRequest,
  GetFileStatusResponse,
} from '../../../../../../libs/contracts/src/';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GenerateUrlForUploadCommand } from '../application/use-cases/generate-url-for-upload.use-case';
import { GetFilesDataQuery } from '../application/queries/get-files-data.query';
import { GrpcResponseMapper } from './mappers/grpc-response.mapper';
import { GenerateUrlForUploadDto } from '../application/use-cases/dto/generate-url-for-upload.dto';
import { GrpcRequestMapper } from './mappers/grpc-request.mapper';
import { GetFileStatusQuery } from '../application/queries/get-file-status.query';
import { GetFileStatusDto } from './dto/get-file-status.dto';
import { FileViewType } from '../domain/file.types';

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
    const result: FileViewType[] | null = await this.queryBus.execute(new GetFilesDataQuery(data));
    return GrpcResponseMapper.getFilesDataResponse(result);
  }

  @GrpcMethod('FileService', 'GetFileStatus')
  async getFileStatus(data: GetFileStatusRequest): Promise<GetFileStatusResponse> {
    const dto: GetFileStatusDto = GrpcRequestMapper.getFileStatusRequest(data);
    const result: FileViewType = await this.queryBus.execute(new GetFileStatusQuery(dto));
    return GrpcResponseMapper.getFileStatusResponse(result);
  }
}

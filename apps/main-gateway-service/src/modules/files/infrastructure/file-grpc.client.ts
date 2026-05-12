import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import {
  FILE_SERVICE_NAME,
  type FileServiceClient,
  type GenerateUploadUrlRequest,
  type GenerateUploadUrlResponse,
} from '../../../../../../libs/contracts/src';
import { GrpcErrorMapper } from '../../../common/grpc/grpc-error.mapper';
import { FILE_SERVICE_GRPC_CLIENT } from './file-grpc.constants';

@Injectable()
export class FileGrpcClient implements OnModuleInit {
  private fileService: FileServiceClient;

  constructor(@Inject(FILE_SERVICE_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.fileService = this.client.getService<FileServiceClient>(FILE_SERVICE_NAME);
  }

  async generateUploadUrl(request: GenerateUploadUrlRequest): Promise<GenerateUploadUrlResponse> {
    try {
      return await firstValueFrom(this.fileService.generateUploadUrl(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }
}

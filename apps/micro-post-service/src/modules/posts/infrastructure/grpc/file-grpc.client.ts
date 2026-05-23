import type { ClientGrpc } from '@nestjs/microservices';
import { Inject, Injectable } from '@nestjs/common';
import {
  FileServiceClient,
  GetFilesDataRequest,
  GetFilesDataResponse,
} from '../../../../../../../libs/contracts/src/';
import { firstValueFrom } from 'rxjs';
import { GrpcErrorMapper } from '../../../../../../main-gateway-service/src/common/grpc/grpc-error.mapper';

@Injectable()
export class FileGrpcClient {
  private fileService: FileServiceClient;
  constructor(@Inject('FILE_SERVICE_PACKAGE') private readonly client: ClientGrpc) {
    this.fileService = this.client.getService('FileService');
  }

  async getFilesByIds(data: GetFilesDataRequest): Promise<GetFilesDataResponse> {
    try {
      return await firstValueFrom(this.fileService.getFilesData(data));
    } catch (error) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { FileGrpcClient } from './file-grpc.client';
import { GetFilesDataResponse } from '@inctagram/contracts';
import { GrpcRequestMapper } from '../mappers/grpc-request.mapper';
import { FileDataType } from '../../domain/post.types';

@Injectable()
export class GrpcAdapter {
  constructor(private readonly fileGrpcClient: FileGrpcClient) {}

  async getFilesByIds({ fileIds }: { fileIds: string[] }): Promise<FileDataType | null> {
    const result: GetFilesDataResponse = await this.fileGrpcClient.getFilesByIds({
      fileIds,
    });
    return GrpcRequestMapper.getFilesDataResponse(result.files);
  }
}

import { FileGrpcClient } from '../file-grpc.client';
import {
  GetFileStatusBatchRequestDto,
  GetFileStatusBatchResponseDto,
} from '../../api/dto/get-file-status-batch.dto';
import { IRpcAdapter } from '../../domain/interfaces/rpc-adapter.interface';
import { FileRequestGrpcMapper } from '../mappers/file.request.grpc-mapper';
import {
  GetFileStatusBatchRequest,
  GetFileStatusBatchResponse,
} from '../../../../../../../libs/contracts/src/generated/file';
import { FileResponseGrpcMapper } from '../mappers/file.response.grpc-mapper';

export class FileGrpcAdapter implements IRpcAdapter {
  constructor(private readonly grpcClient: FileGrpcClient) {}

  async getFileStatusBatch(
    dto: GetFileStatusBatchRequestDto,
  ): Promise<GetFileStatusBatchResponseDto> {
    const request: GetFileStatusBatchRequest = FileRequestGrpcMapper.getFileStatusBatchRequest(dto);
    const response: GetFileStatusBatchResponse = await this.grpcClient.getFileStatusBatch(request);
    return FileResponseGrpcMapper.getFileStatusBatch(response);
  }
}

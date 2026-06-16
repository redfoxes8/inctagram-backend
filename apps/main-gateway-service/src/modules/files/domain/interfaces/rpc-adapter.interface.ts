import {
  GetFileStatusBatchRequestDto,
  GetFileStatusBatchResponseDto,
} from '../../api/dto/get-file-status-batch.dto';

export abstract class IRpcAdapter {
  abstract getFileStatusBatch(
    dto: GetFileStatusBatchRequestDto,
  ): Promise<GetFileStatusBatchResponseDto>;
}

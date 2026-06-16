import { GetFileStatusBatchRequestDto } from '../../api/dto/get-file-status-batch.dto';
import { GetFileStatusBatchRequest } from '../../../../../../../libs/contracts/src/generated/file';

export class FileRequestGrpcMapper {
  public static getFileStatusBatchRequest(
    dto: GetFileStatusBatchRequestDto,
  ): GetFileStatusBatchRequest {
    return {
      fileIds: dto.fileIds,
    };
  }
}

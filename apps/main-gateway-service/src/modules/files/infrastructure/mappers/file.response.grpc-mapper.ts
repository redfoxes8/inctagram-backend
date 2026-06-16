import {
  FileStatus,
  GetFileStatusBatchResponse,
} from '../../../../../../../libs/contracts/src/generated/file';
import {
  FileStatusDataDomain,
  GetFileStatusBatchResponseDto,
} from '../../api/dto/get-file-status-batch.dto';
import { FileStatusDomain } from '../../../../../../micro-files-service/src/modules/files/domain/file.types';
import { Logger } from '@nestjs/common';

export class FileResponseGrpcMapper {
  private static readonly logger = new Logger(FileResponseGrpcMapper.name);

  public static getFileStatusBatch(dto: GetFileStatusBatchResponse): GetFileStatusBatchResponseDto {
    const result: FileStatusDataDomain[] = dto.filesStatus.map((fileStatus) => {
      return {
        id: fileStatus.id,
        status: this.statusToDomain(fileStatus.status, fileStatus.id),
      };
    });
    return {
      filesStatus: result,
    };
  }

  private static statusToDomain(status: FileStatus, id: string): FileStatusDomain {
    switch (status) {
      case FileStatus.DELETING:
        return FileStatusDomain.DELETING;
      case FileStatus.UPLOADED:
        return FileStatusDomain.UPLOADED;
      case FileStatus.PENDING:
        return FileStatusDomain.PENDING;
      case FileStatus.FAILED_DELETE:
        return FileStatusDomain.FAILED_DELETE;
      default:
        this.logger.warn(`Unknown file status: ${status} for file with id: ${id}.`);
        return FileStatusDomain.UNKNOWN;
    }
  }
}

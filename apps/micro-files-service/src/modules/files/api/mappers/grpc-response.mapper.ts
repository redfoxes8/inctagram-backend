import {
  FileData,
  FileStatus,
  FileType,
  GetFilesDataResponse,
  GetFileStatusResponse,
} from '../../../../../../../libs/contracts/src';
import { FileStatusDomain, FileTypeDomain, FileViewType } from '../../domain/file.types';
import {
  FileStatusData,
  GetFileStatusBatchResponse,
} from '../../../../../../../libs/contracts/src/generated/file';

export class GrpcResponseMapper {
  public static getFilesDataResponse(files: FileViewType[] | null): GetFilesDataResponse {
    if (!files) {
      return { files: {} };
    }
    const filesMap = files.reduce(
      (acc, file) => {
        acc[file.id] = {
          fileId: file.id,
          fileUrl: file.url,
        };
        return acc;
      },
      {} as Record<string, FileData>,
    );
    return { files: filesMap };
  }

  public static getFileStatusResponse(file: FileViewType): GetFileStatusResponse {
    const fileType: FileType = this.typeToGrpc(file.type);
    const fileStatus: FileStatus = this.statusToGrpc(file.status);
    return {
      file: {
        id: file.id,
        ownerId: file.userId,
        status: fileStatus,
        fileUrl: file.url,
        fileType: fileType,
        fileSize: file.size,
      },
    };
  }

  public static getFileStatusBatchResponse(files: FileViewType[]): GetFileStatusBatchResponse {
    const filesStatus: FileStatusData[] = files.map((file) => {
      return {
        id: file.id,
        status: this.statusToGrpc(file.status),
      };
    });
    return {
      filesStatus: filesStatus,
    };
  }

  private static typeToGrpc(type: FileTypeDomain): FileType {
    switch (type) {
      case FileTypeDomain.AVATAR:
        return FileType.AVATAR;
      case FileTypeDomain.MEDIA:
        return FileType.MEDIA;
      case FileTypeDomain.DOCUMENT:
        return FileType.DOCUMENT;
      case FileTypeDomain.POST_IMAGE:
        return FileType.POST_IMAGE;
      default:
        return FileType.FILE_TYPE_UNSPECIFIED;
    }
  }

  private static statusToGrpc(status: FileStatusDomain): FileStatus {
    switch (status) {
      case FileStatusDomain.PENDING:
        return FileStatus.PENDING;
      case FileStatusDomain.UPLOADED:
        return FileStatus.UPLOADED;
      case FileStatusDomain.DELETING:
        return FileStatus.DELETING;
      case FileStatusDomain.FAILED_DELETE:
        return FileStatus.FAILED_DELETE;
      default:
        return FileStatus.FILE_STATUS_UNSPECIFIED;
    }
  }
}

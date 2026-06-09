import { FileData } from '@inctagram/contracts';
import { FileDataType } from '../../domain/post.types';

export class GrpcRequestMapper {
  static getFilesDataResponse(filesData?: Record<string, FileData>): FileDataType | null {
    if (!filesData) {
      return null;
    }
    return {
      files: filesData,
    };
  }
}

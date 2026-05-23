import { FileEntity } from '../../domain/file.entity';
import { FileData, GetFilesDataResponse } from '../../../../../../../libs/contracts/src';

export class GrpcResponseMapper {
  public static getFilesDataResponse(files: FileEntity[]): GetFilesDataResponse {
    const filesMap = files.reduce(
      (acc, file) => {
        acc[file.id] = {
          fileId: file.id,
          fileUrl: `https://${file.getBucket()}.s3.${file.getRegion()}.amazonaws.com/${file.getS3Key()}`,
        };
        return acc;
      },
      {} as Record<string, FileData>,
    );
    return { files: filesMap };
  }
}

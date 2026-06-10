import { FileViewType } from '../../domain/file.types';
import { FileEntity } from '../../domain/file.entity';

export class FileViewTypeMapper {
  public static toViewType(file: FileEntity): FileViewType {
    return {
      extension: file.getFileExtension(),
      status: file.getStatus(),
      userId: file.getUserId(),
      type: file.getFileType(),
      id: file.id,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      deletedAt: file.deletedAt,
      url: `https://${file.getBucket()}.s3.${file.getRegion()}.amazonaws.com/${file.getS3Key()}`,
      size: file.getSize(),
    };
  }

  public static toViewTypeMany(files: FileEntity[]): FileViewType[] {
    return files.map((file) => this.toViewType(file));
  }
}

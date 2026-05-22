import { FileStatusDomain, FileType } from '../../domain/file.types';
import { FileEntity } from '../../domain/file.entity';
import { File as PrismaFile } from '../../../../core/prisma/client';

export type PrismaFileRecord = PrismaFile;

export class FileMapper {
  public static toDomain(prismaFileRecord: PrismaFileRecord): FileEntity {
    return new FileEntity({
      id: prismaFileRecord.id,
      createdAt: prismaFileRecord.createdAt,
      updatedAt: prismaFileRecord.updatedAt,
      deletedAt: prismaFileRecord.deletedAt,
      s3Key: prismaFileRecord.s3Key,
      bucket: prismaFileRecord.bucket,
      fileExtension: prismaFileRecord.fileExtension,
      status: prismaFileRecord.status as unknown as FileStatusDomain,
      userId: prismaFileRecord.userId,
      fileType: prismaFileRecord.fileType as unknown as FileType,
    });
  }

  public static toPrismaRecord(fileEntity: FileEntity): PrismaFileRecord {
    return {
      id: fileEntity.id,
      s3Key: fileEntity.getS3Key(),
      bucket: fileEntity.getBucket(),
      fileExtension: fileEntity.getFileExtension(),
      status: fileEntity.getStatus() as any,
      userId: fileEntity.getUserId(),
      createdAt: fileEntity.createdAt,
      updatedAt: fileEntity.updatedAt,
      deletedAt: fileEntity.deletedAt,
      fileType: fileEntity.getFileType() as any,
    };
  }
}

import { FileStatusDomain, FileType } from '../../domain/file.types';
import { FileEntity } from '../../domain/file.entity';
import { File as PrismaFile, FileStatus } from '../../../../core/prisma/client';

export type PrismaFileRecord = PrismaFile;

export class PrismaMapper {
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
      region: prismaFileRecord.region,
    });
  }

  public static toPrismaRecord(fileEntity: FileEntity): PrismaFileRecord {
    return {
      id: fileEntity.id,
      s3Key: fileEntity.getS3Key(),
      bucket: fileEntity.getBucket(),
      region: fileEntity.getRegion(),
      fileExtension: fileEntity.getFileExtension(),
      status: fileEntity.getStatus() as any,
      userId: fileEntity.getUserId(),
      createdAt: fileEntity.createdAt,
      updatedAt: fileEntity.updatedAt,
      deletedAt: fileEntity.deletedAt,
      fileType: fileEntity.getFileType() as any,
    };
  }

  public static toDomainMany(prismaFileRecords: PrismaFileRecord[]): FileEntity[] {
    return prismaFileRecords.map((record) => this.toDomain(record));
  }

  public static statusToPrismaRecord(fileStatus: FileStatusDomain): FileStatus {
    return FileStatus[fileStatus];
  }
}

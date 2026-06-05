import { FileStatusDomain, FileTypeDomain } from '../../domain/file.types';
import { FileEntity } from '../../domain/file.entity';
import { File as PrismaFile, FileStatus, FileType } from '../../../../core/prisma/client';

export type PrismaFileRecord = PrismaFile;

export class PrismaMapper {
  public static toDomain(prismaFileRecord: PrismaFileRecord): FileEntity {
    const status: FileStatusDomain = this.statusToDomain(prismaFileRecord.status);
    const type: FileTypeDomain = this.typeToDomain(prismaFileRecord.fileType);
    return new FileEntity({
      id: prismaFileRecord.id,
      createdAt: prismaFileRecord.createdAt,
      updatedAt: prismaFileRecord.updatedAt,
      deletedAt: prismaFileRecord.deletedAt,
      s3Key: prismaFileRecord.s3Key,
      bucket: prismaFileRecord.bucket,
      fileExtension: prismaFileRecord.fileExtension,
      status: status,
      userId: prismaFileRecord.userId,
      fileType: type,
      region: prismaFileRecord.region,
    });
  }

  public static toPrismaRecord(fileEntity: FileEntity): PrismaFileRecord {
    const status: FileStatus = this.statusToPrismaRecord(fileEntity.getStatus());
    const type: FileType = this.typeToPrismaRecord(fileEntity.getFileType());
    return {
      id: fileEntity.id,
      s3Key: fileEntity.getS3Key(),
      bucket: fileEntity.getBucket(),
      region: fileEntity.getRegion(),
      fileExtension: fileEntity.getFileExtension(),
      status: status,
      userId: fileEntity.getUserId(),
      createdAt: fileEntity.createdAt,
      updatedAt: fileEntity.updatedAt,
      deletedAt: fileEntity.deletedAt,
      fileType: type,
    };
  }

  public static toDomainMany(prismaFileRecords: PrismaFileRecord[]): FileEntity[] {
    return prismaFileRecords.map((record) => this.toDomain(record));
  }

  public static statusToPrismaRecord(fileStatus: FileStatusDomain): FileStatus {
    return FileStatus[fileStatus];
  }

  public static statusToDomain(fileStatus: FileStatus): FileStatusDomain {
    return FileStatusDomain[fileStatus];
  }

  public static typeToPrismaRecord(fileType: FileTypeDomain): FileType {
    return FileType[fileType];
  }

  public static typeToDomain(fileType: FileType): FileTypeDomain {
    return FileTypeDomain[fileType];
  }
}

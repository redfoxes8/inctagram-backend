import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import { File, FileStatus } from '../../../../core/prisma/client';
import { FileEntity } from '../../domain/file.entity';
import { PrismaMapper, PrismaFileRecord } from '../mappers/prisma.mapper';
import { FileStatusDomain } from '../../domain/file.types';

@Injectable()
export class FilesRepository implements IFilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(file: FileEntity): Promise<void> {
    const prismaFileRecord: PrismaFileRecord = PrismaMapper.toPrismaRecord(file);
    await this.prisma.file.upsert({
      where: { id: prismaFileRecord.id },
      update: prismaFileRecord,
      create: prismaFileRecord,
    });
    return;
  }

  async findPendingOlderThan(date: Date, limit?: number): Promise<FileEntity[] | null> {
    const result: File[] = await this.prisma.file.findMany({
      where: {
        status: FileStatus.PENDING,
        createdAt: {
          lt: date,
        },
      },
      take: limit,
    });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.toDomainMany(result);
  }

  async findFailedDeleteFiles(limit?: number): Promise<FileEntity[] | null> {
    const result: File[] = await this.prisma.file.findMany({
      where: {
        status: FileStatus.FAILED_DELETE,
      },
      take: limit,
    });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.toDomainMany(result);
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.file.delete({
      where: { id },
    });
    return;
  }

  async findFileByKey(key: string): Promise<FileEntity | null> {
    const prismaFileRecord: File | null = await this.prisma.file.findFirst({
      where: { s3Key: key },
    });
    if (!prismaFileRecord) {
      return null;
    }
    return PrismaMapper.toDomain(prismaFileRecord);
  }

  async deleteManyById(ids: string[]): Promise<void> {
    await this.prisma.file.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
    return;
  }

  async deleteManyByS3Key(s3Keys: string[]): Promise<void> {
    await this.prisma.file.deleteMany({
      where: {
        s3Key: {
          in: s3Keys,
        },
      },
    });
    return;
  }

  async updateStatusManyById(ids: string[], fileStatus: FileStatusDomain): Promise<void> {
    const prismaStatus: FileStatus = PrismaMapper.statusToPrismaRecord(fileStatus);
    await this.prisma.file.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: { status: prismaStatus },
    });
  }

  async updateStatusManyByS3Key(s3Keys: string[], fileStatus: FileStatusDomain): Promise<void> {
    const prismaStatus: FileStatus = PrismaMapper.statusToPrismaRecord(fileStatus);
    await this.prisma.file.updateMany({
      where: {
        s3Key: {
          in: s3Keys,
        },
      },
      data: { status: prismaStatus },
    });
    return;
  }

  async findByIds(ids: string[]): Promise<FileEntity[] | null> {
    const result: PrismaFileRecord[] | [] = await this.prisma.file.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.toDomainMany(result);
  }
}

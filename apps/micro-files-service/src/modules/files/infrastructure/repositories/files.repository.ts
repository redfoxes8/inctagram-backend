import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import {
  File,
  FileStatus,
} from 'prisma-client-c9ea7ac4dae25d90f941f49fb3a88e26350f93ac627e54aa0ca88e765f18cbc2';
import { FileEntity } from '../../domain/file.entity';
import { FileMapper, PrismaFileRecord } from '../mappers/file.mapper';
import { FileStatusDomain } from '../../domain/file.types';

@Injectable()
export class FilesRepository implements IFilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(file: FileEntity): Promise<void> {
    const prismaFileRecord: PrismaFileRecord = FileMapper.toPrismaRecord(file);
    await this.prisma.file.upsert({
      where: { id: prismaFileRecord.id },
      update: prismaFileRecord,
      create: prismaFileRecord,
    });
    return;
  }

  async findPendingOlderThan(date: Date, limit?: number): Promise<File[]> {
    return this.prisma.file.findMany({
      where: {
        status: FileStatus.PENDING,
        createdAt: {
          lt: date,
        },
      },
      take: limit,
    });
  }

  async findFailedDeleteFiles(limit?: number): Promise<File[]> {
    return this.prisma.file.findMany({
      where: {
        status: FileStatus.FAILED_DELETE,
      },
      take: limit,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.file.delete({
      where: { id },
    });
  }

  async findFileByKey(key: string): Promise<FileEntity | null> {
    const prismaFileRecord: File | null = await this.prisma.file.findFirst({
      where: { s3Key: key },
    });
    if (prismaFileRecord) {
      return FileMapper.toDomain(prismaFileRecord);
    } else return null;
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.prisma.file.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
  }

  async updateStatus(fileId: string, fileStatus: FileStatusDomain): Promise<void> {
    await this.prisma.file.update({
      where: { id: fileId },
      data: { status: fileStatus as unknown as FileStatus },
    });
    return;
  }

  async updateStatusMany(ids: string[], status: FileStatus): Promise<void> {
    await this.prisma.file.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: { status },
    });
  }

  async findByIds(ids: string[]): Promise<File[]> {
    return this.prisma.file.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
  }
}

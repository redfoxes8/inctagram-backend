import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { IFilesRepository } from '../domain/interfaces/files.repository.interface';
import { File, FileStatus } from '../../../core/prisma/client';
import { FileEntity } from '../domain/file.entity';
import { FileMapper, PrismaFileRecord } from './mappers/file.mapper';

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

  async updateStatus(fileEntity: FileEntity): Promise<void> {
    const fileStatus = fileEntity.getStatus() as unknown as FileStatus;
    await this.prisma.file.update({
      where: { id: fileEntity.id },
      data: { status: fileStatus },
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

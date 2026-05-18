import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { IFilesRepository } from '../domain/interfaces/files.repository.interface';
import { File, FileStatus } from '../../../core/prisma/client';
import { FileType } from '../domain/file.types';

@Injectable()
export class FilesRepository implements IFilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    s3Key: string;
    bucket: string;
    fileType: FileType;
    userId: string;
  }): Promise<File> {
    return this.prisma.file.create({
      data: {
        s3Key: data.s3Key,
        bucket: data.bucket,
        fileType: data.fileType,
        userId: data.userId,
        status: FileStatus.PENDING,
      },
    });
  }

  async findPendingOlderThan(date: Date): Promise<File[]> {
    return this.prisma.file.findMany({
      where: {
        status: FileStatus.PENDING,
        createdAt: {
          lt: date,
        },
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.file.delete({
      where: { id },
    });
  }

  async updateStatus(id: string, status: FileStatus): Promise<void> {
    await this.prisma.file.update({
      where: { id },
      data: { status },
    });
  }
}

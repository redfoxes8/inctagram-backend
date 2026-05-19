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

  async findFileByKey(key: string): Promise<FileEntity | null> {
    const prismaFileRecord: File | null = await this.prisma.file.findFirst({
      where: { s3Key: key },
    });
    if (prismaFileRecord) {
      return FileMapper.toDomain(prismaFileRecord);
    } else return null;
  }
}

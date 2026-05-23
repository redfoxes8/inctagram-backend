import { PrismaService } from '../../../../core/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { IFilesQueryRepository } from '../../domain/interfaces/files.query-repository.interface';
import { FileEntity } from '../../domain/file.entity';
import { File as PrismaFile } from '../../../../core/prisma/client';
import { FileMapper } from '../mappers/file.mapper';

export type PrismaFileRecord = PrismaFile;

@Injectable()
export class FilesQueryRepository implements IFilesQueryRepository {
  constructor(private readonly prisma: PrismaService) {}
  async getFilesByIds(ids: string[]): Promise<FileEntity[] | null> {
    const result: PrismaFileRecord[] | null = await this.prisma.file.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
    if (!result) {
      return null;
    }
    return FileMapper.toDomainMany(result);
  }
}

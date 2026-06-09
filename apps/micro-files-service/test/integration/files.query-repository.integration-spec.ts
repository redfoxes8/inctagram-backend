import { Test, TestingModule } from '@nestjs/testing';
import { FilesQueryRepository } from '../../src/modules/files/infrastructure/repositories/files.query-repository';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { FileStatusDomain, FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { FilesConfig } from '../../src/core/files.config';
import { randomUUID } from 'crypto';

describe('FilesQueryRepository - Integration Tests', () => {
  let repository: FilesQueryRepository;
  let prisma: PrismaService;

  jest.setTimeout(1000000);

  beforeAll(async () => {
    await resetDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesQueryRepository,
        {
          provide: FilesConfig,
          useValue: {
            prismaDbUrl: process.env.PRISMA_DB_URL,
          },
        },
        PrismaService,
      ],
    }).compile();

    repository = module.get<FilesQueryRepository>(FilesQueryRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.file.deleteMany();
  });

  describe('getFilesByIds', () => {
    it('should find files by list of IDs', async () => {
      const file1 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'key1.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'region',
          status: FileStatusDomain.UPLOADED as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      const file2 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'key2.jpg',
          bucket: 'bucket1',
          fileExtension: '.png',
          region: 'region',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.POST_IMAGE as any,
        },
      });

      const files = await repository.getFilesByIds([file1.id, file2.id]);

      expect(files).toHaveLength(2);
    });

    it('should return an empty array if files are not found', async () => {
      const files = await repository.getFilesByIds([randomUUID(), randomUUID()]);

      expect(files).toEqual([]);
    });
  });
});

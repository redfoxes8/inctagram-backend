import { Test, TestingModule } from '@nestjs/testing';
import { FilesRepository } from '../../src/modules/files/infrastructure/repositories/files.repository';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { FileStatusDomain, FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { FilesConfig } from '../../src/core/files.config';
import { randomUUID } from 'crypto';

describe('FilesRepository - Integration Tests', () => {
  let repository: FilesRepository;
  let prisma: PrismaService;
  jest.setTimeout(1000000);
  beforeAll(async () => {
    await resetDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesRepository,
        {
          provide: FilesConfig,
          useValue: {
            prismaDbUrl: process.env.PRISMA_DB_URL,
          },
        },
        PrismaService,
      ],
    }).compile();

    repository = module.get<FilesRepository>(FilesRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.file.deleteMany();
  });

  describe('save', () => {
    it('должен сохранять новую сущность файла', async () => {
      const fileEntity = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        region: 'someRegion',
        fileType: FileTypeDomain.AVATAR,
      });

      fileEntity.setS3Props('test-key.jpg', 'test-bucket');

      await repository.save(fileEntity);

      const savedFile = await prisma.file.findUnique({
        where: { id: fileEntity.id },
      });

      expect(savedFile).toBeDefined();
      expect(savedFile?.id).toBe(fileEntity.id);
      expect(savedFile?.s3Key).toBe('test-key.jpg');
      expect(savedFile?.bucket).toBe('test-bucket');
      expect(savedFile?.status).toBe(FileStatusDomain.PENDING);
    });

    it('должен обновлять существующую сущность файла', async () => {
      const fileEntity = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        region: 'someRegion',
        fileType: FileTypeDomain.AVATAR,
      });

      fileEntity.setS3Props('test-key.jpg', 'test-bucket');
      await repository.save(fileEntity);

      fileEntity.updateStatus(FileStatusDomain.UPLOADED);
      await repository.save(fileEntity);

      const updatedFile = await prisma.file.findUnique({
        where: { id: fileEntity.id },
      });

      expect(updatedFile?.status).toBe(FileStatusDomain.UPLOADED);
    });
  });

  describe('findByIds', () => {
    it('должен находить файлы по списку ID', async () => {
      const file1 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'key1.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      const file2 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'key2.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.UPLOADED as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.POST_IMAGE as any,
        },
      });

      const files: FileEntity[] | null = await repository.findByIds([file1.id, file2.id]);

      expect(files).toHaveLength(2);
    });

    it('должен возвращать null если файлы не найдены', async () => {
      const files: FileEntity[] | null = await repository.findByIds([randomUUID(), randomUUID()]);

      expect(files).toBeNull();
    });
  });

  describe('findPendingOlderThan', () => {
    it('должен находить PENDING файлы старше указанной даты', async () => {
      const oldDate = new Date('2020-01-01');
      const recentDate = new Date();

      const file1 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'old-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
          createdAt: oldDate,
        },
      });

      await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'recent-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
          createdAt: recentDate,
        },
      });

      const files: FileEntity[] | null = await repository.findPendingOlderThan(recentDate);

      expect(files).not.toBeNull();
      expect(files).toHaveLength(1);
      expect(files![0].id).toBe(file1.id);
    });

    it('должен учитывать лимит', async () => {
      const oldDate = new Date('2020-01-01');

      for (let i = 0; i < 10; i++) {
        await prisma.file.create({
          data: {
            id: randomUUID(),
            s3Key: `key${i}.jpg`,
            bucket: 'bucket1',
            fileExtension: '.jpg',
            region: 'someRegion',
            status: FileStatusDomain.PENDING as any,
            userId: randomUUID(),
            fileType: FileTypeDomain.AVATAR as any,
            createdAt: oldDate,
          },
        });
      }

      const files: FileEntity[] | null = await repository.findPendingOlderThan(new Date(), 5);

      expect(files).not.toBeNull();
      expect(files).toHaveLength(5);
    });

    it('должен фильтровать только PENDING статус', async () => {
      const oldDate = new Date('2020-01-01');

      const pendingFile = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'pending-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
          createdAt: oldDate,
        },
      });

      await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'uploaded-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.UPLOADED as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
          createdAt: oldDate,
        },
      });

      const files: FileEntity[] | null = await repository.findPendingOlderThan(new Date());

      expect(files).not.toBeNull();
      expect(files).toHaveLength(1);
      expect(files![0].id).toBe(pendingFile.id);
    });
  });

  describe('findFailedDeleteFiles', () => {
    it('должен находить файлы со статусом FAILED_DELETE', async () => {
      const failedFile = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'failed-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.FAILED_DELETE as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'pending-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      const files: FileEntity[] | null = await repository.findFailedDeleteFiles();

      expect(files).not.toBeNull();
      expect(files).toHaveLength(1);
      expect(files![0].id).toBe(failedFile.id);
    });

    it('должен учитывать лимит', async () => {
      for (let i = 0; i < 10; i++) {
        await prisma.file.create({
          data: {
            id: randomUUID(),
            s3Key: `key${i}.jpg`,
            bucket: 'bucket1',
            fileExtension: '.jpg',
            region: 'someRegion',
            status: FileStatusDomain.FAILED_DELETE as any,
            userId: randomUUID(),
            fileType: FileTypeDomain.AVATAR as any,
          },
        });
      }

      const files: FileEntity[] | null = await repository.findFailedDeleteFiles(5);

      expect(files).not.toBeNull();
      expect(files).toHaveLength(5);
    });
  });

  describe('deleteMany', () => {
    it('должен удалять несколько файлов по ID', async () => {
      const file1 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'key1.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      const file2 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'key2.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      await repository.deleteManyById([file1.id, file2.id]);

      const files = await prisma.file.findMany({
        where: { id: { in: [file1.id, file2.id] } },
      });

      expect(files).toHaveLength(0);
    });
  });

  describe('updateStatusMany', () => {
    it('должен обновлять статус для нескольких файлов', async () => {
      const file1 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'key1.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      const file2 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'key2.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      await repository.updateStatusManyById([file1.id, file2.id], FileStatusDomain.DELETING);

      const files = await prisma.file.findMany({
        where: { id: { in: [file1.id, file2.id] } },
      });

      expect(files[0].status).toBe(FileStatusDomain.DELETING);
      expect(files[1].status).toBe(FileStatusDomain.DELETING);
    });
  });

  describe('findFileByKey', () => {
    it('должен находить файл по S3 ключу и мапить в доменную сущность', async () => {
      const file1 = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'test-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.UPLOADED as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      const fileEntity: FileEntity | null = await repository.findFileByKey('test-key.jpg');

      expect(fileEntity).toBeInstanceOf(FileEntity);
      expect(fileEntity?.id).toBe(file1.id);
      expect(fileEntity?.getS3Key()).toBe('test-key.jpg');
      expect(fileEntity?.getBucket()).toBe('bucket1');
    });

    it('должен возвращать null если файл не найден', async () => {
      const fileEntity: FileEntity | null = await repository.findFileByKey('nonexistent-key.jpg');

      expect(fileEntity).toBeNull();
    });
  });

  describe('фильтрация по статусам', () => {
    it('должен корректно фильтровать файлы по разным статусам', async () => {
      const pendingFile = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'pending.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.PENDING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'uploaded.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.UPLOADED as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'deleting.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.DELETING as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      const failedFile = await prisma.file.create({
        data: {
          id: randomUUID(),
          s3Key: 'failed.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          region: 'someRegion',
          status: FileStatusDomain.FAILED_DELETE as any,
          userId: randomUUID(),
          fileType: FileTypeDomain.AVATAR as any,
        },
      });

      const pendingFiles: FileEntity[] | null = await repository.findPendingOlderThan(new Date());
      expect(pendingFiles).not.toBeNull();
      expect(pendingFiles).toHaveLength(1);
      expect(pendingFiles![0].id).toBe(pendingFile.id);

      const failedFiles: FileEntity[] | null = await repository.findFailedDeleteFiles();
      expect(failedFiles).not.toBeNull();
      expect(failedFiles).toHaveLength(1);
      expect(failedFiles![0].id).toBe(failedFile.id);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { FilesRepository } from '../../src/modules/files/infrastructure/files.repository';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { FileStatusDomain, FileType } from '../../src/modules/files/domain/file.types';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';

describe('FilesRepository - Integration Tests', () => {
  let repository: FilesRepository;
  let prisma: PrismaService;

  beforeAll(async () => {
    await resetDb({
      prismaConfigPath: 'apps/micro-files-service/src/core/prisma/prisma.config.ts',
      envFilePath: 'apps/micro-files-service/.env.test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesRepository,
        PrismaService,
        {
          provide: 'FilesConfig',
          useValue: {
            prismaDbUrl: process.env.PRISMA_DB_URL,
          },
        },
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
        userId: 'user1',
        fileType: FileType.AVATAR,
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
        userId: 'user1',
        fileType: FileType.AVATAR,
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
      await prisma.file.create({
        data: {
          id: 'file1',
          s3Key: 'key1.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: 'file2',
          s3Key: 'key2.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.UPLOADED as any,
          userId: 'user1',
          fileType: FileType.POST_IMAGE as any,
        },
      });

      const files = await repository.findByIds(['file1', 'file2']);

      expect(files).toHaveLength(2);
      expect(files[0].id).toBe('file1');
      expect(files[1].id).toBe('file2');
    });

    it('должен возвращать пустой массив если файлы не найдены', async () => {
      const files = await repository.findByIds(['nonexistent1', 'nonexistent2']);

      expect(files).toHaveLength(0);
    });
  });

  describe('findPendingOlderThan', () => {
    it('должен находить PENDING файлы старше указанной даты', async () => {
      const oldDate = new Date('2020-01-01');
      const recentDate = new Date();

      await prisma.file.create({
        data: {
          id: 'old-file',
          s3Key: 'old-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
          createdAt: oldDate,
        },
      });

      await prisma.file.create({
        data: {
          id: 'recent-file',
          s3Key: 'recent-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
          createdAt: recentDate,
        },
      });

      const files = await repository.findPendingOlderThan(recentDate);

      expect(files).toHaveLength(1);
      expect(files[0].id).toBe('old-file');
    });

    it('должен учитывать лимит', async () => {
      const oldDate = new Date('2020-01-01');

      for (let i = 0; i < 10; i++) {
        await prisma.file.create({
          data: {
            id: `file${i}`,
            s3Key: `key${i}.jpg`,
            bucket: 'bucket1',
            fileExtension: '.jpg',
            status: FileStatusDomain.PENDING as any,
            userId: 'user1',
            fileType: FileType.AVATAR as any,
            createdAt: oldDate,
          },
        });
      }

      const files = await repository.findPendingOlderThan(new Date(), 5);

      expect(files).toHaveLength(5);
    });

    it('должен фильтровать только PENDING статус', async () => {
      const oldDate = new Date('2020-01-01');

      await prisma.file.create({
        data: {
          id: 'pending-file',
          s3Key: 'pending-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
          createdAt: oldDate,
        },
      });

      await prisma.file.create({
        data: {
          id: 'uploaded-file',
          s3Key: 'uploaded-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.UPLOADED as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
          createdAt: oldDate,
        },
      });

      const files = await repository.findPendingOlderThan(new Date());

      expect(files).toHaveLength(1);
      expect(files[0].id).toBe('pending-file');
    });
  });

  describe('findFailedDeleteFiles', () => {
    it('должен находить файлы со статусом FAILED_DELETE', async () => {
      await prisma.file.create({
        data: {
          id: 'failed-file',
          s3Key: 'failed-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.FAILED_DELETE as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: 'pending-file',
          s3Key: 'pending-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      const files = await repository.findFailedDeleteFiles();

      expect(files).toHaveLength(1);
      expect(files[0].id).toBe('failed-file');
    });

    it('должен учитывать лимит', async () => {
      for (let i = 0; i < 10; i++) {
        await prisma.file.create({
          data: {
            id: `file${i}`,
            s3Key: `key${i}.jpg`,
            bucket: 'bucket1',
            fileExtension: '.jpg',
            status: FileStatusDomain.FAILED_DELETE as any,
            userId: 'user1',
            fileType: FileType.AVATAR as any,
          },
        });
      }

      const files = await repository.findFailedDeleteFiles(5);

      expect(files).toHaveLength(5);
    });
  });

  describe('deleteMany', () => {
    it('должен удалять несколько файлов по ID', async () => {
      await prisma.file.create({
        data: {
          id: 'file1',
          s3Key: 'key1.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: 'file2',
          s3Key: 'key2.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await repository.deleteMany(['file1', 'file2']);

      const files = await prisma.file.findMany({
        where: { id: { in: ['file1', 'file2'] } },
      });

      expect(files).toHaveLength(0);
    });
  });

  describe('updateStatusMany', () => {
    it('должен обновлять статус для нескольких файлов', async () => {
      await prisma.file.create({
        data: {
          id: 'file1',
          s3Key: 'key1.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: 'file2',
          s3Key: 'key2.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await repository.updateStatusMany(['file1', 'file2'], FileStatusDomain.DELETING as any);

      const files = await prisma.file.findMany({
        where: { id: { in: ['file1', 'file2'] } },
      });

      expect(files[0].status).toBe(FileStatusDomain.DELETING);
      expect(files[1].status).toBe(FileStatusDomain.DELETING);
    });
  });

  describe('findFileByKey', () => {
    it('должен находить файл по S3 ключу и мапить в доменную сущность', async () => {
      await prisma.file.create({
        data: {
          id: 'file1',
          s3Key: 'test-key.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.UPLOADED as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      const fileEntity = await repository.findFileByKey('test-key.jpg');

      expect(fileEntity).toBeInstanceOf(FileEntity);
      expect(fileEntity?.id).toBe('file1');
      expect(fileEntity?.getS3Key()).toBe('test-key.jpg');
      expect(fileEntity?.getBucket()).toBe('bucket1');
    });

    it('должен возвращать null если файл не найден', async () => {
      const fileEntity = await repository.findFileByKey('nonexistent-key.jpg');

      expect(fileEntity).toBeNull();
    });
  });

  describe('фильтрация по статусам', () => {
    it('должен корректно фильтровать файлы по разным статусам', async () => {
      await prisma.file.create({
        data: {
          id: 'pending',
          s3Key: 'pending.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.PENDING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: 'uploaded',
          s3Key: 'uploaded.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.UPLOADED as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: 'deleting',
          s3Key: 'deleting.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.DELETING as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      await prisma.file.create({
        data: {
          id: 'failed',
          s3Key: 'failed.jpg',
          bucket: 'bucket1',
          fileExtension: '.jpg',
          status: FileStatusDomain.FAILED_DELETE as any,
          userId: 'user1',
          fileType: FileType.AVATAR as any,
        },
      });

      const pendingFiles = await repository.findPendingOlderThan(new Date());
      expect(pendingFiles).toHaveLength(1);
      expect(pendingFiles[0].id).toBe('pending');

      const failedFiles = await repository.findFailedDeleteFiles();
      expect(failedFiles).toHaveLength(1);
      expect(failedFiles[0].id).toBe('failed');
    });
  });
});

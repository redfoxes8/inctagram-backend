import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FilesController } from '../../src/modules/files/api/files.controller';
import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { FileStatusDomain, FileType } from '../../src/modules/files/domain/file.types';
import { IStorageAdapter } from '../../src/modules/files/application/interfaces/storage-adapter.interface';
import { PresignedUrlResult } from '../../src/modules/files/domain/file.types';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { FilesConfig } from '../../src/core/files.config';
import { AppModule } from '../../src/app.module';

describe('Files gRPC Endpoint - E2E Tests', () => {
  jest.setTimeout(100000);
  let app: INestApplication;
  let prisma: PrismaService;
  let commandBus: CommandBus;
  // let storageAdapter: jest.Mocked<IStorageAdapter>;
  let storageAdapter = jest.mocked<IStorageAdapter>({
    generateUploadUrl: jest.fn(),
    deleteFile: jest.fn(),
    deleteFiles: jest.fn(),
  });
  beforeAll(async () => {
    await resetDb();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      // controllers: [FilesController],
      // providers: [
      //   CommandBus,
      //   PrismaService,
      //   {
      //     provide: FilesConfig,
      //     useValue: {
      //       prismaDbUrl: process.env.PRISMA_DB_URL,
      //     },
      //   },
      //   {
      //     provide: IStorageAdapter,
      //     useValue: {
      //       generateUploadUrl: jest.fn(),
      //       deleteFile: jest.fn(),
      //       deleteFiles: jest.fn(),
      //     },
      //   },
      // ],
    }).compile();

    app = module.createNestApplication();
    prisma = module.get<PrismaService>(PrismaService);
    commandBus = module.get<CommandBus>(CommandBus);
    storageAdapter = module.get(IStorageAdapter);

    await app.init();
  });

  afterAll(async () => {});

  beforeEach(async () => {
    await prisma.file.deleteMany();
    jest.clearAllMocks();
  });

  describe('GenerateUploadUrl - gRPC endpoint', () => {
    it('должен возвращать DTO с presigned URL и создавать запись со статусом PENDING', async () => {
      const mockPresignedResult: PresignedUrlResult = {
        uploadUrl: 'https://test-bucket.s3.amazonaws.com',
        uploadFields: {
          key: 'test-key',
          'Content-Type': 'image/jpeg',
        },
        s3Key: 'AVATAR/user123/file456',
        bucket: 'test-bucket',
        expiresIn: 3600,
        fileId: 'file456',
      };

      const mockRequest = {
        ownerId: 'user123',
        fileExtension: '.jpg',
        fileType: 1, // AVATAR
      };
      const storageGenerateUrlSpy = jest
        .spyOn(storageAdapter, 'generateUploadUrl')
        .mockResolvedValue(mockPresignedResult);

      const result = await commandBus.execute({
        dto: mockRequest,
        fileType: FileType.AVATAR,
      });

      expect(storageGenerateUrlSpy).toHaveBeenCalledWith(
        'user123',
        FileType.AVATAR,
        '.jpg',
        expect.any(String),
      );

      expect(result).toEqual({
        uploadUrl: mockPresignedResult.uploadUrl,
        fileId: mockPresignedResult.fileId,
        uploadFields: Object.entries(mockPresignedResult.uploadFields).map(([name, value]) => ({
          name,
          value: String(value),
        })),
      });

      const fileRecord = await prisma.file.findUnique({
        where: { id: mockPresignedResult.fileId },
      });

      expect(fileRecord).toBeDefined();
      expect(fileRecord?.status).toBe(FileStatusDomain.PENDING as any);
      expect(fileRecord?.s3Key).toBe(mockPresignedResult.s3Key);
      expect(fileRecord?.bucket).toBe(mockPresignedResult.bucket);
    });

    it('должен корректно маппить gRPC fileType в domain FileType', async () => {
      const mockPresignedResult: PresignedUrlResult = {
        uploadUrl: 'https://test-bucket.s3.amazonaws.com',
        uploadFields: {
          key: 'test-key',
          'Content-Type': 'image/jpeg',
        },
        s3Key: 'POST_IMAGE/user123/file456',
        bucket: 'test-bucket',
        expiresIn: 3600,
        fileId: 'file456',
      };
      const storageGenerateUrlSpy = jest
        .spyOn(storageAdapter, 'generateUploadUrl')
        .mockResolvedValue(mockPresignedResult);

      const mockRequest = {
        ownerId: 'user123',
        fileExtension: '.jpg',
        fileType: 2, // POST_IMAGE
      };

      await commandBus.execute({
        dto: mockRequest,
        fileType: FileType.POST_IMAGE,
      });

      expect(storageGenerateUrlSpy).toHaveBeenCalledWith(
        'user123',
        FileType.POST_IMAGE,
        '.jpg',
        expect.any(String),
      );
    });

    it('должен создавать запись с правильными полями в БД', async () => {
      const mockPresignedResult: PresignedUrlResult = {
        uploadUrl: 'https://test-bucket.s3.amazonaws.com',
        uploadFields: {
          key: 'test-key',
          'Content-Type': 'image/jpeg',
        },
        s3Key: 'AVATAR/user123/file456',
        bucket: 'test-bucket',
        expiresIn: 3600,
        fileId: 'file456',
      };

      storageAdapter.generateUploadUrl.mockResolvedValue(mockPresignedResult);

      const mockRequest = {
        ownerId: 'user123',
        fileExtension: '.jpg',
        fileType: 1,
      };

      await commandBus.execute({
        dto: mockRequest,
        fileType: FileType.AVATAR,
      });

      const fileRecord = await prisma.file.findUnique({
        where: { id: mockPresignedResult.fileId },
      });

      expect(fileRecord).toBeDefined();
      expect(fileRecord?.userId).toBe('user123');
      expect(fileRecord?.fileExtension).toBe('.jpg');
      expect(fileRecord?.fileType).toBe(FileType.AVATAR as any);
      expect(fileRecord?.status).toBe(FileStatusDomain.PENDING as any);
      expect(fileRecord?.s3Key).toBe(mockPresignedResult.s3Key);
      expect(fileRecord?.bucket).toBe(mockPresignedResult.bucket);
    });

    it('должен обрабатывать разные типы файлов', async () => {
      const fileTypes = [
        { grpcType: 1, domainType: FileType.AVATAR },
        { grpcType: 2, domainType: FileType.POST_IMAGE },
        { grpcType: 3, domainType: FileType.DOCUMENT },
        { grpcType: 4, domainType: FileType.MEDIA },
      ];

      for (const { grpcType, domainType } of fileTypes) {
        const mockPresignedResult: PresignedUrlResult = {
          uploadUrl: 'https://test-bucket.s3.amazonaws.com',
          uploadFields: {
            key: 'test-key',
            'Content-Type': 'image/jpeg',
          },
          s3Key: `${domainType}/user123/file456`,
          bucket: 'test-bucket',
          expiresIn: 3600,
          fileId: `file-${grpcType}`,
        };

        storageAdapter.generateUploadUrl.mockResolvedValue(mockPresignedResult);

        const mockRequest = {
          ownerId: 'user123',
          fileExtension: '.jpg',
          fileType: grpcType,
        };

        await commandBus.execute({
          dto: mockRequest,
          fileType: domainType,
        });

        const fileRecord = await prisma.file.findUnique({
          where: { id: mockPresignedResult.fileId },
        });

        expect(fileRecord?.fileType).toBe(domainType as any);
      }
    });
  });
});

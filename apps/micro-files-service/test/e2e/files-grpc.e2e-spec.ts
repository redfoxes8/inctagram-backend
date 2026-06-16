import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import {
  FileStatusDomain,
  FileTypeDomain,
  PresignedUrlResponse,
} from '../../src/modules/files/domain/file.types';
import { IStorageAdapter } from '../../src/modules/files/infrastructure/interfaces/storage-adapter.interface';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { AppModule } from '../../src/app.module';
import { FilesConfig } from '../../src/core/files.config';
import { FilesController } from '../../src/modules/files/api/files.controller';
import { GenerateUrlForUploadCommand } from '../../src/modules/files/application/use-cases/generate-url-for-upload.use-case';
import { randomUUID } from 'crypto';

describe('Files gRPC Endpoint - E2E Tests', () => {
  jest.setTimeout(100000);
  let app: INestApplication;
  let prisma: PrismaService;
  let commandBus: CommandBus;
  let storageAdapter: jest.Mocked<IStorageAdapter>;

  beforeAll(async () => {
    await resetDb();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FilesController],
      providers: [
        CommandBus,
        PrismaService,
        {
          provide: FilesConfig,
          useValue: {
            prismaDbUrl: process.env.PRISMA_DB_URL,
          },
        },
        {
          provide: IStorageAdapter,
          useValue: {
            generateUploadUrl: jest.fn(),
            deleteFile: jest.fn(),
            deleteFiles: jest.fn(),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    prisma = module.get<PrismaService>(PrismaService);
    commandBus = module.get<CommandBus>(CommandBus);
    storageAdapter = module.get(IStorageAdapter);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GenerateUploadUrl - gRPC endpoint', () => {
    it('должен возвращать DTO с presigned URL и создавать запись со статусом PENDING', async () => {
      const ownerId: string = randomUUID();
      let mockPresignedResult!: PresignedUrlResponse;

      const mockRequest = {
        ownerId: ownerId,
        fileExtension: '.jpg',
        fileType: FileTypeDomain.AVATAR,
        fileSize: 1024,
      };
      const storageGenerateUrlSpy = jest.spyOn(storageAdapter, 'generateUploadUrl');
      storageGenerateUrlSpy.mockImplementation(async (dto) => {
        return (mockPresignedResult = {
          uploadUrl: 'https://test-bucket.s3.amazonaws.com',
          uploadFields: {
            key: 'test-key',
            'Content-Type': 'image/jpeg',
          },
          s3Key: 'AVATAR/user123/file456',
          bucket: 'test-bucket',
          expiresIn: 3600,
          fileId: dto.fileId,
        });
      });

      const result = await commandBus.execute(new GenerateUrlForUploadCommand(mockRequest));

      expect(storageGenerateUrlSpy).toHaveBeenCalledWith({
        fileExtension: mockRequest.fileExtension,
        fileId: mockPresignedResult.fileId,
        fileType: mockRequest.fileType,
        userId: ownerId,
      });

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
      const ownerId: string = randomUUID();
      let mockPresignedResult!: PresignedUrlResponse;

      const storageGenerateUrlSpy = jest
        .spyOn(storageAdapter, 'generateUploadUrl')
        .mockImplementation(async (dto) => {
          return (mockPresignedResult = {
            uploadUrl: 'https://test-bucket.s3.amazonaws.com',
            uploadFields: {
              key: 'test-key',
              'Content-Type': 'image/jpeg',
            },
            s3Key: 'POST_IMAGE/user123/file456',
            bucket: 'test-bucket',
            expiresIn: 3600,
            fileId: dto.fileId,
          });
        });

      const mockRequest = {
        ownerId: ownerId,
        fileExtension: '.jpg',
        fileType: FileTypeDomain.POST_IMAGE,
        fileSize: 1024,
      };

      await commandBus.execute(new GenerateUrlForUploadCommand(mockRequest));

      expect(storageGenerateUrlSpy).toHaveBeenCalledWith({
        fileExtension: mockRequest.fileExtension,
        fileId: mockPresignedResult.fileId,
        fileType: mockRequest.fileType,
        userId: ownerId,
      });
    });

    it('должен создавать запись с правильными полями в БД', async () => {
      const ownerId: string = randomUUID();
      let mockPresignedResult!: PresignedUrlResponse;

      jest.spyOn(storageAdapter, 'generateUploadUrl').mockImplementation(async (dto) => {
        return (mockPresignedResult = {
          uploadUrl: 'https://test-bucket.s3.amazonaws.com',
          uploadFields: {
            key: 'test-key',
            'Content-Type': 'image/jpeg',
          },
          s3Key: 'AVATAR/user123/file456',
          bucket: 'test-bucket',
          expiresIn: 3600,
          fileId: dto.fileId,
        });
      });

      const mockRequest = {
        ownerId: ownerId,
        fileExtension: '.jpg',
        fileType: FileTypeDomain.AVATAR,
        fileSize: 1024,
      };

      await commandBus.execute(new GenerateUrlForUploadCommand(mockRequest));

      const fileRecord = await prisma.file.findUnique({
        where: { id: mockPresignedResult.fileId },
      });

      expect(fileRecord).toBeDefined();
      expect(fileRecord?.userId).toBe(ownerId);
      expect(fileRecord?.extension).toBe('.jpg');
      expect(fileRecord?.type).toBe(FileTypeDomain.AVATAR as any);
      expect(fileRecord?.status).toBe(FileStatusDomain.PENDING as any);
      expect(fileRecord?.s3Key).toBe(mockPresignedResult.s3Key);
      expect(fileRecord?.bucket).toBe(mockPresignedResult.bucket);
    });

    it('должен обрабатывать разные типы файлов', async () => {
      const ownerId: string = randomUUID();
      const fileTypes: FileTypeDomain[] = [
        FileTypeDomain.AVATAR,
        FileTypeDomain.POST_IMAGE,
        FileTypeDomain.DOCUMENT,
        FileTypeDomain.MEDIA,
      ];

      for (const domainType of fileTypes) {
        let mockPresignedResult!: PresignedUrlResponse;

        jest.spyOn(storageAdapter, 'generateUploadUrl').mockImplementation(async (dto) => {
          return (mockPresignedResult = {
            uploadUrl: 'https://test-bucket.s3.amazonaws.com',
            uploadFields: {
              key: 'test-key',
              'Content-Type': 'image/jpeg',
            },
            s3Key: `${domainType}/user123/file456`,
            bucket: 'test-bucket',
            expiresIn: 3600,
            fileId: dto.fileId,
          });
        });

        const mockRequest = {
          ownerId: ownerId,
          fileExtension: '.jpg',
          fileType: domainType,
          fileSize: 1024,
        };

        await commandBus.execute(new GenerateUrlForUploadCommand(mockRequest));

        const fileRecord = await prisma.file.findUnique({
          where: { id: mockPresignedResult.fileId },
        });

        expect(fileRecord?.type).toBe(domainType as any);
      }
    });
  });
});

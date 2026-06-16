import { Test, TestingModule } from '@nestjs/testing';
import { AwsStorageAdapter } from '../../src/modules/files/infrastructure/aws/aws-storage.adapter';
import { FilesConfig } from '../../src/core/files.config';
import { FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { BadRequestException } from '@nestjs/common';

jest.mock('@aws-sdk/s3-presigned-post');
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  DeleteObjectCommand: jest.fn(),
  DeleteObjectsCommand: jest.fn(),
}));

import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { S3Client, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';

describe('AwsStorageAdapter - Unit Tests', () => {
  let adapter: AwsStorageAdapter;
  const mockedCreatePresignedPost = jest.mocked(createPresignedPost);
  let mockedS3ClientSend: jest.Mock;

  beforeEach(async () => {
    mockedS3ClientSend = jest.fn();
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockedS3ClientSend,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AwsStorageAdapter,
        {
          provide: FilesConfig,
          useValue: {
            awsRegion: 'eu-central-1',
            awsAccessKeyId: 'test-key',
            awsSecretAccessKey: 'test-secret',
            s3BucketImages: 'test-images-bucket',
            s3BucketDocuments: 'test-documents-bucket',
            s3BucketMedia: 'test-media-bucket',
          },
        },
      ],
    }).compile();

    adapter = module.get<AwsStorageAdapter>(AwsStorageAdapter);
    mockedCreatePresignedPost.mockClear();
    mockedS3ClientSend.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateUploadUrl', () => {
    it('должен генерировать presigned URL для AVATAR', async () => {
      mockedCreatePresignedPost.mockResolvedValue({
        url: 'https://test-images-bucket.s3.eu-central-1.amazonaws.com',
        fields: { key: 'test-key' },
      });

      const result = await adapter.generateUploadUrl({
        userId: 'user1',
        fileType: FileTypeDomain.AVATAR,
        fileExtension: '.jpg',
        fileId: 'file1',
      });

      expect(result.uploadUrl).toBe('https://test-images-bucket.s3.eu-central-1.amazonaws.com');
      expect(result.s3Key).toBe('AVATAR/user1/file1');
      expect(result.bucket).toBe('test-images-bucket');
    });

    it('должен генерировать presigned URL для DOCUMENT с fallback бакетом', async () => {
      mockedCreatePresignedPost.mockResolvedValue({
        url: 'https://test-documents-bucket.s3.eu-central-1.amazonaws.com',
        fields: { key: 'test-key' },
      });

      const result = await adapter.generateUploadUrl({
        userId: 'user1',
        fileType: FileTypeDomain.DOCUMENT,
        fileExtension: '.pdf',
        fileId: 'file1',
      });

      expect(result.bucket).toBe('test-documents-bucket');
    });

    it('должен выбрасывать BadRequestException для неподдерживаемого расширения', async () => {
      await expect(
        adapter.generateUploadUrl({
          userId: 'user1',
          fileType: FileTypeDomain.AVATAR,
          fileExtension: '.unsupported',
          fileId: 'file1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBucketConfig', () => {
    it('должен возвращать конфигурацию для AVATAR', () => {
      const config = adapter.getBucketConfig(FileTypeDomain.AVATAR);
      expect(config.name).toBe('test-images-bucket');
      expect(config.maxFileSize).toBe(5 * 1024 * 1024);
    });

    it('должен возвращать конфигурацию для MEDIA с fallback бакетом', () => {
      const config = adapter.getBucketConfig(FileTypeDomain.MEDIA);
      expect(config.name).toBe('test-media-bucket');
      expect(config.maxFileSize).toBe(100 * 1024 * 1024);
    });

    it('должен выбрасывать BadRequestException для неизвестного типа файла', () => {
      expect(() => adapter.getBucketConfig('UNKNOWN' as FileTypeDomain)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteFile', () => {
    it('должен отправлять DeleteObjectCommand', async () => {
      mockedS3ClientSend.mockResolvedValue(undefined);

      await adapter.deleteFile('key1', FileTypeDomain.AVATAR);

      expect(mockedS3ClientSend).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-images-bucket',
        Key: 'key1',
      });
    });
  });

  describe('deleteFiles', () => {
    it('должен отправлять DeleteObjectsCommand', async () => {
      mockedS3ClientSend.mockResolvedValue(undefined);

      await adapter.deleteFiles('test-images-bucket', ['key1', 'key2']);

      expect(mockedS3ClientSend).toHaveBeenCalledTimes(1);
      expect(DeleteObjectsCommand).toHaveBeenCalledWith({
        Bucket: 'test-images-bucket',
        Delete: {
          Objects: [{ Key: 'key1' }, { Key: 'key2' }],
          Quiet: true,
        },
      });
    });

    it('должен ничего не делать при пустом массиве ключей', async () => {
      await adapter.deleteFiles('test-images-bucket', []);

      expect(mockedS3ClientSend).not.toHaveBeenCalled();
    });
  });
});

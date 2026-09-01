import { BadRequestException, Injectable } from '@nestjs/common';
import { DeleteObjectCommand, DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { FilesConfig } from '../../../../core/files.config';
import {
  FileTypeDomain,
  BucketConfig,
  PresignedUrlRequest,
  CONTENT_TYPE_MAP,
  PresignedUrlResponse,
} from '../../domain/file.types';
import { IStorageAdapter } from '../interfaces/storage-adapter.interface';

@Injectable()
export class AwsStorageAdapter implements IStorageAdapter {
  private readonly s3Client: S3Client;

  private readonly bucketConfigs: Map<FileTypeDomain, BucketConfig>;

  constructor(private readonly config: FilesConfig) {
    this.s3Client = new S3Client({
      region: this.config.awsRegion,
      credentials: {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
      },
    });

    this.bucketConfigs = this.initBucketConfigs();
  }

  async generateUploadUrl(dto: PresignedUrlRequest): Promise<PresignedUrlResponse> {
    const bucketConfig = this.getBucketConfig(dto.fileType);

    const normalizedExtension = dto.fileExtension.startsWith('.')
      ? dto.fileExtension.toLowerCase()
      : `.${dto.fileExtension.toLowerCase()}`;

    const contentType = CONTENT_TYPE_MAP[normalizedExtension];

    if (!contentType) {
      throw new BadRequestException(
        `Unsupported file extension: ${dto.fileExtension}. ` +
          `Supported extensions: ${Object.keys(CONTENT_TYPE_MAP).join(', ')}`,
      );
    }

    const s3Key = this.generateS3Key(dto.userId, dto.fileId, dto.fileType);

    try {
      const { url, fields } = await createPresignedPost(this.s3Client, {
        Bucket: bucketConfig.name,
        Key: s3Key,
        Expires: bucketConfig.urlExpiration,
        Fields: {
          'Content-Type': contentType,
        },
        Conditions: [
          ['content-length-range', 1, bucketConfig.maxFileSize],
          ['eq', '$Content-Type', contentType],
        ],
      });

      return {
        uploadUrl: url,
        uploadFields: fields,
        s3Key: s3Key,
        bucket: bucketConfig.name,
        expiresIn: bucketConfig.urlExpiration,
        fileId: dto.fileId,
      };
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  /**
   * Возвращает конфигурацию бакета по типу файла
   */
  getBucketConfig(fileType: FileTypeDomain): BucketConfig {
    const config = this.bucketConfigs.get(fileType);

    if (!config) {
      throw new BadRequestException(`Unknown file type: ${fileType}`);
    }

    return config;
  }

  /**
   * Генерирует уникальный путь в S3
   * Формат: {fileType}/{userId}/{fileId}
   */
  private generateS3Key(userId: string, fileId: string, fileType: FileTypeDomain): string {
    return `${fileType}/${userId}/${fileId}`;
  }

  /**
   * Инициализирует конфигурации бакетов для разных типов файлов
   */
  private initBucketConfigs(): Map<FileTypeDomain, BucketConfig> {
    return new Map<FileTypeDomain, BucketConfig>([
      [
        FileTypeDomain.AVATAR,
        {
          name: this.config.s3BucketImages,
          maxFileSize: 5 * 1024 * 1024, // 5MB
          allowedContentTypes: ['image/jpeg', 'image/png'],
          urlExpiration: 3600, // 1 час
        },
      ],
      [
        FileTypeDomain.POST_IMAGE,
        {
          name: this.config.s3BucketImages,
          maxFileSize: 20 * 1024 * 1024, // 20MB
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          urlExpiration: 3600,
        },
      ],
      [
        FileTypeDomain.DOCUMENT,
        {
          name: this.config.s3BucketDocuments ?? this.config.s3BucketImages,
          maxFileSize: 50 * 1024 * 1024, // 50MB
          allowedContentTypes: ['application/pdf'],
          urlExpiration: 3600,
        },
      ],
      [
        FileTypeDomain.MEDIA,
        {
          name: this.config.s3BucketMedia ?? this.config.s3BucketImages,
          maxFileSize: 100 * 1024 * 1024, // 100MB
          allowedContentTypes: ['video/mp4', 'video/webm', 'audio/mpeg'],
          urlExpiration: 7200, // 2 часа для больших файлов
        },
      ],
    ]);
  }

  /**
   * Удаляет файл из S3
   */
  async deleteFile(fileKey: string, fileType: FileTypeDomain): Promise<void> {
    const bucketConfig = this.getBucketConfig(fileType);

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketConfig.name,
        Key: fileKey,
      }),
    );
  }

  /**
   * Удаляет массив файлов из S3
   */
  async deleteFiles(bucket: string, fileKeys: string[]): Promise<void> {
    if (fileKeys.length === 0) return;
    const s3Keys: { Key: string }[] = fileKeys.map((s3Key) => {
      return {
        Key: s3Key,
      };
    });
    await this.s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: s3Keys,
          Quiet: true,
        },
      }),
    );
  }
}

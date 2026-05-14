import { BadRequestException, Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as path from 'path';

import { FilesConfig } from '../../../core/files.config';
import { FileType, BucketConfig, PresignedUrlResult, CONTENT_TYPE_MAP } from '../domain/file.types';

@Injectable()
export class AwsStorageAdapter {
  private readonly s3Client: S3Client;
  private readonly bucketConfigs: Map<FileType, BucketConfig>;

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

  /**
   * Генерирует presigned URL для загрузки файла напрямую в S3
   * @param userId - ID пользователя
   * @param fileName - Имя файла с расширением (например: photo.jpg)
   * @param fileType - Тип файла (определяет бакет и лимиты)
   */
  async getSignedUrlForUpload(
    userId: string,
    fileName: string,
    fileType: FileType,
  ): Promise<PresignedUrlResult> {
    const bucketConfig = this.getBucketConfig(fileType);
    const contentType = this.getContentTypeFromFileName(fileName);

    // Валидация: разрешён ли этот content-type для данного типа файла
    if (!bucketConfig.allowedContentTypes.includes(contentType)) {
      throw new BadRequestException(
        `File type "${path.extname(fileName)}" is not allowed for ${fileType}. ` +
          `Allowed types: ${bucketConfig.allowedContentTypes.join(', ')}`,
      );
    }

    const s3Key = this.generateS3Key(userId, fileName, fileType);

    const command = new PutObjectCommand({
      Bucket: bucketConfig.name,
      Key: s3Key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: bucketConfig.urlExpiration,
      signableHeaders: new Set(['content-type']),
    });

    return {
      uploadUrl,
      s3Key,
      bucket: bucketConfig.name,
      expiresIn: bucketConfig.urlExpiration,
    };
  }

  /**
   * Возвращает конфигурацию бакета по типу файла
   */
  getBucketConfig(fileType: FileType): BucketConfig {
    const config = this.bucketConfigs.get(fileType);

    if (!config) {
      throw new BadRequestException(`Unknown file type: ${fileType}`);
    }

    return config;
  }

  /**
   * Определяет content-type по расширению файла
   */
  private getContentTypeFromFileName(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const contentType = CONTENT_TYPE_MAP[ext];

    if (!contentType) {
      throw new BadRequestException(
        `Unsupported file extension: ${ext}. ` +
          `Supported extensions: ${Object.keys(CONTENT_TYPE_MAP).join(', ')}`,
      );
    }

    return contentType;
  }

  /**
   * Генерирует уникальный путь в S3
   * Формат: {fileType}/{userId}/{timestamp}_{sanitizedFileName}
   */
  private generateS3Key(userId: string, fileName: string, fileType: FileType): string {
    const timestamp = Date.now();
    const sanitizedFileName = this.sanitizeFileName(fileName);

    return `${fileType}/${userId}/${timestamp}_${sanitizedFileName}`;
  }

  /**
   * Очищает имя файла от потенциально опасных символов
   */
  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  }

  /**
   * Инициализирует конфигурации бакетов для разных типов файлов
   */
  private initBucketConfigs(): Map<FileType, BucketConfig> {
    return new Map<FileType, BucketConfig>([
      [
        FileType.AVATAR,
        {
          name: this.config.s3BucketImages,
          maxFileSize: 5 * 1024 * 1024, // 5MB
          allowedContentTypes: ['image/jpeg', 'image/png'],
          urlExpiration: 3600, // 1 час
        },
      ],
      [
        FileType.POST_IMAGE,
        {
          name: this.config.s3BucketImages,
          maxFileSize: 20 * 1024 * 1024, // 20MB
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          urlExpiration: 3600,
        },
      ],
      [
        FileType.DOCUMENT,
        {
          name: this.config.s3BucketDocuments ?? this.config.s3BucketImages,
          maxFileSize: 50 * 1024 * 1024, // 50MB
          allowedContentTypes: ['application/pdf'],
          urlExpiration: 3600,
        },
      ],
      [
        FileType.MEDIA,
        {
          name: this.config.s3BucketMedia ?? this.config.s3BucketImages,
          maxFileSize: 100 * 1024 * 1024, // 100MB
          allowedContentTypes: ['video/mp4', 'video/webm', 'audio/mpeg'],
          urlExpiration: 7200, // 2 часа для больших файлов
        },
      ],
    ]);
  }
}

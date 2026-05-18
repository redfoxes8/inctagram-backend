import { BadRequestException, Injectable } from '@nestjs/common';
import { DeleteObjectCommand, DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { FilesConfig } from '../../../../core/files.config';
import {
  FileType,
  BucketConfig,
  PresignedUrlResult,
  CONTENT_TYPE_MAP,
} from '../../domain/file.types';
import { IStorageAdapter } from '../../application/interfaces/storage-adapter.interface';

@Injectable()
export class AwsStorageAdapter implements IStorageAdapter {
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
   * @param fileType - Тип файла (определяет бакет и лимиты)
   * @param fileExtension - Расширение файла (например: .jpg, .png)
   * @param fileId - ID файла
   */
  async generateUploadUrl(
    userId: string,
    fileType: FileType,
    fileExtension: string,
    fileId: string,
  ): Promise<PresignedUrlResult> {
    const bucketConfig = this.getBucketConfig(fileType);

    const contentType = CONTENT_TYPE_MAP[fileExtension];

    if (!contentType) {
      throw new BadRequestException(
        `Unsupported file extension: ${fileExtension}. ` +
          `Supported extensions: ${Object.keys(CONTENT_TYPE_MAP).join(', ')}`,
      );
    }

    const s3Key = this.generateS3Key(userId, fileId, fileType);

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
      fileId: fileId,
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
   * Генерирует уникальный путь в S3
   * Формат: {fileType}/{userId}/{timestamp}_{sanitizedFileName}
   */
  private generateS3Key(userId: string, fileName: string, fileType: FileType): string {
    return `${fileType}/${userId}/${fileName}`;
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

  /**
   * Удаляет файл из S3
   */
  async deleteFile(fileKey: string, fileType: FileType): Promise<void> {
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
  async deleteFiles(fileKeys: string[], fileType: FileType): Promise<void> {
    if (fileKeys.length === 0) return;
    const bucketConfig = this.getBucketConfig(fileType);

    const chunkSize = 1000;
    for (let i = 0; i < fileKeys.length; i += chunkSize) {
      const chunk = fileKeys.slice(i, i + chunkSize);
      await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucketConfig.name,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );
    }
  }
}

/**
 * Типы файлов для разных бакетов
 */
export enum FileType {
  AVATAR = 'avatar',
  POST_IMAGE = 'post_image',
  DOCUMENT = 'document',
  MEDIA = 'media',
}

/**
 * Статусы загрузки файла
 */
export enum FileStatus {
  PENDING = 'PENDING',
  UPLOADED = 'UPLOADED',
  FAILED = 'FAILED',
  DELETING = 'DELETING',
  FAILED_DELETE = 'FAILED_DELETE',
}

/**
 * Маппинг расширений файлов на content-type
 */
export const CONTENT_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

/**
 * Конфигурация бакета
 */
export interface BucketConfig {
  name: string;
  maxFileSize: number;
  allowedContentTypes: string[];
  urlExpiration: number;
}

/**
 * Результат генерации presigned URL
 */
export interface PresignedUrlResult {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  s3Key: string;
  bucket: string;
  expiresIn: number;
  fileId: string;
}

/**
 * Типы файлов для разных бакетов
 */
export enum FileTypeDomain {
  AVATAR = 'AVATAR',
  POST_IMAGE = 'POST_IMAGE',
  DOCUMENT = 'DOCUMENT',
  MEDIA = 'MEDIA',
}

/**
 * Статусы загрузки файла
 */
export enum FileStatusDomain {
  PENDING = 'PENDING',
  UPLOADED = 'UPLOADED',
  DELETING = 'DELETING',
  FAILED_DELETE = 'FAILED_DELETE',
  UNKNOWN = 'UNKNOWN',
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
export interface PresignedUrlResponse {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  s3Key: string;
  bucket: string;
  expiresIn: number;
  fileId: string;
}

export interface PresignedUrlRequest {
  userId: string;
  fileType: FileTypeDomain;
  fileExtension: string;
  fileId: string;
}

export type FileViewType = {
  extension: string;
  status: FileStatusDomain;
  userId: string;
  type: FileTypeDomain;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  url: string;
  size: number;
};

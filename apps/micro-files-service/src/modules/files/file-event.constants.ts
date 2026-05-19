import { FileType } from './domain/file.types';

export const FILES_EVENT_CLIENT = 'FILES_EVENT_CLIENT';

export enum FileEvents {
  FileUploaded = 'FileUploaded',
}

export type FileUploadedPayload = {
  fileId: string;
  userId: string;
  s3Key: string;
  bucket: string;
  fileType: FileType;
  fileExtension: string;
};

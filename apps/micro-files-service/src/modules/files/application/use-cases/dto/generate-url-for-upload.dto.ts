import { FileTypeDomain } from '../../../domain/file.types';

export class GenerateUrlForUploadDto {
  ownerId: string;
  fileType: FileTypeDomain;
  fileSize: number;
  fileExtension: string;
}

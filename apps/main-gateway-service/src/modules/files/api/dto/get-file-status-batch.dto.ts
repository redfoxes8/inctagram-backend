import { IsArray, MaxLength, MinLength } from 'class-validator';
import { FileStatusDomain } from '../../../../../../micro-files-service/src/modules/files/domain/file.types';

export class GetFileStatusBatchRequestDto {
  @IsArray({ message: 'fileIds must be string array' })
  @MinLength(1, { message: 'min length must be more then 1' })
  @MaxLength(30, { message: 'max length must be less then 30' })
  fileIds: string[];
}

export class GetFileStatusBatchResponseDto {
  filesStatus: FileStatusDataDomain[];
}

export type FileStatusDataDomain = {
  id: string;
  status: FileStatusDomain;
};

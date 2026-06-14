import { ArrayMaxSize, ArrayMinSize, IsArray } from 'class-validator';
import { FileStatusDomain } from '../../../../../../micro-files-service/src/modules/files/domain/file.types';

export class GetFileStatusBatchRequestDto {
  @IsArray({ message: 'fileIds must be string array' })
  @ArrayMinSize(1, { message: 'Min array length must be more then 1' })
  @ArrayMaxSize(30, { message: 'Max array length must be less then 30' })
  fileIds: string[];
}

export class GetFileStatusBatchResponseDto {
  filesStatus: FileStatusDataDomain[];
}

export type FileStatusDataDomain = {
  id: string;
  status: FileStatusDomain;
};

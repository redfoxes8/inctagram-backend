import { IsNotEmpty, IsUUID } from 'class-validator';

export class GetFileStatusDto {
  @IsNotEmpty({ message: 'File id is required' })
  @IsUUID(undefined, { message: 'File id must be a valid UUID' })
  fileId: string;
}

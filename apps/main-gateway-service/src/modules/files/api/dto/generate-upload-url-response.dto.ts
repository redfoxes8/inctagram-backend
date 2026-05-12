import { ApiProperty } from '@nestjs/swagger';

export class GenerateUploadUrlResponseDto {
  @ApiProperty({ example: 'https://storage.nymbi.org/signed-upload-url' })
  uploadUrl: string;

  @ApiProperty({ example: 'file-id' })
  fileId: string;
}

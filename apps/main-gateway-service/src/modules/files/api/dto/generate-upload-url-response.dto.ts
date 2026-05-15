import { ApiProperty } from '@nestjs/swagger';

export class GenerateUploadUrlResponseDto {
  @ApiProperty({ example: 'https://storage.nymbi.org/signed-upload-url' })
  uploadUrl: string;

  @ApiProperty({
    description: 'Form fields that must be sent with multipart/form-data POST to S3',
    example: {
      key: 'post_image/user-id/123_photo.jpg',
      'Content-Type': 'image/jpeg',
      policy: 'base64-policy',
      'x-amz-signature': 'signature',
    },
  })
  uploadFields: Record<string, string>;

  @ApiProperty({ example: 'file-id' })
  fileId: string;
}

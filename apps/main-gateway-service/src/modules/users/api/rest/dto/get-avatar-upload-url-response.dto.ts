import { ApiProperty } from '@nestjs/swagger';

export class UploadFieldDto {
  @ApiProperty({ example: 'key' })
  name: string;

  @ApiProperty({ example: 'avatar/user-id/123_photo.webp' })
  value: string;
}

export class GetAvatarUploadUrlResponseDto {
  @ApiProperty({
    example: 'https://storage.nymbi.org/signed-upload-url',
    description: 'The exact URL where the frontend should upload the file.',
  })
  uploadUrl: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'The internal ID of the file created in the database.',
  })
  fileId: string;

  @ApiProperty({
    description: 'Form fields that must be appended before uploading the file.',
    type: [UploadFieldDto],
  })
  uploadFields: UploadFieldDto[];
}

import { ApiProperty } from '@nestjs/swagger';

export class GeneratePostImageUploadUrlResponseDto {
  @ApiProperty({
    example: 'https://storage.nymbi.org/signed-upload-url',
    description: 'The exact URL where the frontend should make the multipart/form-data POST request.',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'Form fields that must be appended to the FormData before uploading the file to S3.',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: {
      key: 'post_image/user-id/123_photo.webp',
      'Content-Type': 'image/webp',
      policy: 'eyJhbGciOiJIUzI1NiIsInR5...',
      'x-amz-signature': 'signature-hash',
    },
  })
  uploadFields: Record<string, string>;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'The internal ID of the file created in the database. Use this ID when attaching the file to a Post.',
  })
  fileId: string;
}

import { ApiProperty } from '@nestjs/swagger';

export class ConfirmAvatarResponseDto {
  @ApiProperty({
    example: 'https://storage.nymbi.org/avatars/user-id/photo.webp',
    description: 'The public URL of the confirmed avatar.',
  })
  avatarUrl: string;
}

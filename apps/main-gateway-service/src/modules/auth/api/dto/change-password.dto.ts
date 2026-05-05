import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDTO {
  @ApiProperty({ description: 'Recovery code sent via email', example: '123456-abc-...' })
  @IsString()
  @Length(6, 64)
  recoveryCode: string;

  @ApiProperty({ description: 'New password for the user', example: 'NewStrongPassword123!' })
  @IsString()
  @Length(6, 20)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,20}$/)
  newPassword: string;
}

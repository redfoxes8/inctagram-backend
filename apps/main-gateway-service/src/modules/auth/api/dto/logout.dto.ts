import { IsNotEmpty } from 'class-validator';

export class LogoutDTO {
  @IsNotEmpty()
  userId: string;

  @IsNotEmpty()
  deviceId: string;
}

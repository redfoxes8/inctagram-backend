import { IsNotEmpty } from 'class-validator';

export class DeactivateAllDTO {
  @IsNotEmpty()
  userId: string;

  @IsNotEmpty()
  deviceId: string;
}

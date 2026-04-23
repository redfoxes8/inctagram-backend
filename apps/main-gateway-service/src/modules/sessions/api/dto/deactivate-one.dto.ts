import { IsNotEmpty } from 'class-validator';

export class DeactivateOneDTO {
  @IsNotEmpty()
  deviceId: string;
}

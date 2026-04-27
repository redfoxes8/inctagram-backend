import { IsNotEmpty } from 'class-validator';
import { CurrentUserInfo } from '../../../../../../../libs/common/types/auth.types';

export class DeactivateOneDTO {
  @IsNotEmpty()
  deviceId: string;

  userInfo: CurrentUserInfo;
}

import {
  GetNotificationRecipientContextResponse,
  GetUserByIdResponse,
} from '../../../../../../../../libs/contracts/src/generated/user';
import { UserGrpcDto } from '../dto/user-grpc.dto';

export class UserGrpcMapper {
  static toGetUserByIdResponse(dto: UserGrpcDto): GetUserByIdResponse {
    return {
      user: {
        id: dto.id,
        email: dto.email,
        username: dto.username,
      },
    };
  }

  static toNotificationRecipientContextResponse(
    dto: UserGrpcDto,
  ): GetNotificationRecipientContextResponse {
    return {
      userId: dto.id,
      email: dto.email,
      userName: dto.username,
    };
  }
}

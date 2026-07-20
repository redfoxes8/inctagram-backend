import { User } from '@inctagram/contracts';
import { UserGrpcDto } from '../dto/user-grpc.dto';

export class UserGrpcMapper {
  static toDto(user: User): UserGrpcDto {
    return { id: user.id, email: user.email, username: user.username };
  }
}

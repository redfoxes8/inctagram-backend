import { UserGrpcDto } from '../dto/user-grpc.dto';

export abstract class IUserGrpcAdapter {
  abstract getUserById(userId: string): Promise<UserGrpcDto>;
}

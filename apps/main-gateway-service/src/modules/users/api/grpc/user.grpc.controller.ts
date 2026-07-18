import { Controller } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { GetUserByIdGrpcQuery } from '../../application/queries/get-user-by-id-grpc.query';
import { UserGrpcMapper } from './mappers/user.grpc.mapper';
import { UserGrpcDto } from './dto/user-grpc.dto';
import {
  GetUserByIdRequest,
  GetUserByIdResponse,
  UserServiceController,
  UserServiceControllerMethods,
} from '../../../../../../../libs/contracts/src/generated/user';

@Controller()
@UserServiceControllerMethods()
export class UserGrpcController implements UserServiceController {
  constructor(private readonly queryBus: QueryBus) {}

  async getUserById(request: GetUserByIdRequest): Promise<GetUserByIdResponse> {
    const user: UserGrpcDto = await this.queryBus.execute(new GetUserByIdGrpcQuery(request.userId));

    return UserGrpcMapper.toGetUserByIdResponse(user);
  }
}

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { USER_SERVICE_GRPC_CLIENT } from './user-grpc.constants';
import { GrpcErrorMapper } from '../../../../../../../../libs/common/src/grpc/grpc-error.mapper';
import {
  USER_SERVICE_NAME,
  UserServiceClient,
  GetUserByIdRequest,
  GetUserByIdResponse,
} from '../../../../../../../../libs/contracts/src';

@Injectable()
export class UserGrpcClient implements OnModuleInit {
  private userService: UserServiceClient;

  constructor(
    @Inject(USER_SERVICE_GRPC_CLIENT)
    private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.userService = this.client.getService<UserServiceClient>(USER_SERVICE_NAME);
  }

  async getUserById(request: GetUserByIdRequest): Promise<GetUserByIdResponse> {
    try {
      return await firstValueFrom(this.userService.getUserById(request));
    } catch (error) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }
}

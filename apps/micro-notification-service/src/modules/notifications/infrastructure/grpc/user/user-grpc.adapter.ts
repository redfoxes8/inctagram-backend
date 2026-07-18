import { Injectable } from '@nestjs/common';

import { IUserGrpcAdapter } from './interfaces/user-grpc-adapter.interface';
import { UserGrpcClient } from './user-grpc.client';
import { UserGrpcDto } from './dto/user-grpc.dto';
import { DomainException, DomainExceptionCode } from '../../../../../../../../libs/common/src';
import { UserGrpcMapper } from './mappers/user-grpc.mapper';

@Injectable()
export class UserGrpcAdapter implements IUserGrpcAdapter {
  constructor(private readonly userGrpcClient: UserGrpcClient) {}

  async getUserById(userId: string): Promise<UserGrpcDto> {
    const response = await this.userGrpcClient.getUserById({
      userId,
    });

    if (!response.user) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User not found',
      });
    }

    return UserGrpcMapper.toDto(response.user);
  }
}

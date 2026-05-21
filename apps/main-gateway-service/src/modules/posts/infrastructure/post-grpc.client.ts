import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import {
  type CreatePostRequest,
  type CreatePostResponse,
  type DeletePostRequest,
  type DeletePostResponse,
  type GetPostsByUserIdRequest,
  type GetPostsByUserIdResponse,
  POST_SERVICE_NAME,
  type PostServiceClient,
} from '../../../../../../libs/contracts/src';
import { GrpcErrorMapper } from '../../../common/grpc/grpc-error.mapper';
import { POST_SERVICE_GRPC_CLIENT } from './post-grpc.constants';

@Injectable()
export class PostGrpcClient implements OnModuleInit {
  private postService: PostServiceClient;

  constructor(@Inject(POST_SERVICE_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.postService = this.client.getService<PostServiceClient>(POST_SERVICE_NAME);
  }

  async createPost(request: CreatePostRequest): Promise<CreatePostResponse> {
    try {
      return await firstValueFrom(this.postService.createPost(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async deletePost(request: DeletePostRequest): Promise<DeletePostResponse> {
    try {
      return await firstValueFrom(this.postService.deletePost(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async updatePost(
    request: import('../../../../../../libs/contracts/src').UpdatePostRequest,
  ): Promise<import('../../../../../../libs/contracts/src').UpdatePostResponse> {
    try {
      return await firstValueFrom(this.postService.updatePost(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async getPostsByUserId(request: GetPostsByUserIdRequest): Promise<GetPostsByUserIdResponse> {
    try {
      return await firstValueFrom(this.postService.getPostsByUserId(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }
}

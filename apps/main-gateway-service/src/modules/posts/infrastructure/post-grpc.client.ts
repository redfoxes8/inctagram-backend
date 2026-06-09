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
import { GetLatestPostsRequest, GetLatestPostsResponse } from '@inctagram/contracts/generated/post';

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

  async getLatestPosts(request: GetLatestPostsRequest): Promise<GetLatestPostsResponse> {
    try {
      const response = await firstValueFrom(this.postService.getLatestPosts(request));
      return this.normalizeGetLatestPostsResponse(response);
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  private normalizeGetLatestPostsResponse(response: unknown): GetLatestPostsResponse {
    if (this.isEmptyObject(response)) {
      // grpc/protobuf omits empty repeated fields at runtime, so normalize the empty object boundary here.
      return { posts: [] };
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      Object.prototype.hasOwnProperty.call(response, 'posts') &&
      Array.isArray((response as { posts: unknown }).posts)
    ) {
      return response as GetLatestPostsResponse;
    }

    throw new Error('Malformed GetLatestPostsResponse payload');
  }

  private isEmptyObject(value: unknown): value is Record<string, never> {
    return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
  }
}

import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import {
  firstValueFrom,
  timeout,
  takeUntil,
  fromEvent,
  EmptyError,
  TimeoutError,
  type Observable,
} from 'rxjs';
import type {
  GetSuperadminPostsPageRequest,
  GetSuperadminPostsPageResponse,
  GetSuperadminPostPublishedViewRequest,
  GetSuperadminPostPublishedViewResponse,
} from '../../../../../../libs/contracts/src/generated/post';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

import {
  type CreatePostRequest,
  type CreatePostResponse,
  type DeletePostRequest,
  type DeletePostResponse,
  type GetPostsByUserIdRequest,
  type GetPostsByUserIdResponse,
  type GetPostsCountByUserIdRequest,
  type GetPostsCountByUserIdResponse,
  type GetPostByIdRequest,
  type GetPostByIdResponse,
  POST_SERVICE_NAME,
  type PostServiceClient,
} from '../../../../../../libs/contracts/src';
import { GrpcErrorMapper } from '../../../../../../libs/common/src/grpc/grpc-error.mapper';
import { POST_SERVICE_GRPC_CLIENT } from './post-grpc.constants';
import { GetLatestPostsRequest, GetLatestPostsResponse } from '@inctagram/contracts/generated/post';

@Injectable()
export class PostGrpcClient implements OnModuleInit {
  private readonly logger = new Logger(PostGrpcClient.name);
  private postService: PostServiceClient;

  constructor(@Inject(POST_SERVICE_GRPC_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.postService = this.client.getService<PostServiceClient>(POST_SERVICE_NAME);
  }

  getSuperadminPostsPage(input: {
    request: GetSuperadminPostsPageRequest;
    signal: AbortSignal;
  }): Promise<GetSuperadminPostsPageResponse> {
    return this.adminRead({
      source: this.postService.getSuperadminPostsPage(input.request),
      signal: input.signal,
    });
  }
  getSuperadminPostPublishedView(input: {
    request: GetSuperadminPostPublishedViewRequest;
    signal: AbortSignal;
  }): Promise<GetSuperadminPostPublishedViewResponse> {
    return this.adminRead({
      source: this.postService.getSuperadminPostPublishedView(input.request),
      signal: input.signal,
    });
  }
  private async adminRead<Value>(input: {
    source: Observable<Value>;
    signal: AbortSignal;
  }): Promise<Value> {
    const unavailable = (): DomainException =>
      new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'Posts service unavailable',
      });
    if (input.signal.aborted) throw unavailable();
    try {
      return await firstValueFrom(
        input.source.pipe(timeout({ first: 5000 }), takeUntil(fromEvent(input.signal, 'abort'))),
      );
    } catch (error) {
      if (error instanceof TimeoutError || error instanceof EmptyError || input.signal.aborted)
        throw unavailable();
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'number'
      ) {
        const mapped = GrpcErrorMapper.toDomainException(error);
        if (mapped.code === DomainExceptionCode.BadRequest)
          throw new DomainException({ code: mapped.code, message: 'Invalid posts input' });
        throw unavailable();
      }
      throw error;
    }
  }

  private logGrpcFailure(
    rpcName: string,
    error: any,
    id: { userId?: string; postId?: string },
  ): void {
    const grpcStatus = error?.code ?? 'UNKNOWN';
    const idKey = id.userId ? `userId=${id.userId}` : `postId=${id.postId}`;
    this.logger.warn(
      `gRPC failure - rpcName: ${rpcName}, grpcStatus: ${grpcStatus}, ${idKey}. Message: ${error?.message || 'No message'}`,
    );
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
      this.logGrpcFailure('GetPostsByUserId', error, { userId: request.ownerId });
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async getLatestPosts(request: GetLatestPostsRequest): Promise<GetLatestPostsResponse> {
    try {
      return await firstValueFrom(this.postService.getLatestPosts(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async getPostsCount(
    request: GetPostsCountByUserIdRequest,
  ): Promise<GetPostsCountByUserIdResponse> {
    try {
      return await firstValueFrom(this.postService.getPostsCountByUserId(request));
    } catch (error: unknown) {
      this.logGrpcFailure('GetPostsCountByUserId', error, { userId: request.ownerId });
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async getPostById(request: GetPostByIdRequest): Promise<GetPostByIdResponse> {
    try {
      return await firstValueFrom(this.postService.getPostById(request));
    } catch (error: unknown) {
      this.logGrpcFailure('GetPostById', error, { postId: request.postId });
      throw GrpcErrorMapper.toDomainException(error);
    }
  }
}

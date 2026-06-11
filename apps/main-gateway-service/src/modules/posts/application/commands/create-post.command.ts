import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';

import { CreatePostResponseDto } from '../../api/dto/post-response.dto';
import { CreatePostDto } from '../../api/dto/create-post.dto';
import { PostRequestMapper } from '../../api/mappers/post-request.mapper';
import { PostResponseMapper } from '../../api/mappers/post-response.mapper';
import { PostGrpcClient } from '../../infrastructure/post-grpc.client';

type CreatePostCommandParams = {
  dto: CreatePostDto;
  ownerId: string;
};

export class CreatePostCommand {
  constructor(public readonly params: CreatePostCommandParams) {}
}

@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<
  CreatePostCommand,
  CreatePostResponseDto
> {
  private readonly logger = new Logger(CreatePostHandler.name);
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async execute(command: CreatePostCommand): Promise<CreatePostResponseDto> {
    this.logger.log('[Gateway][Handler] execute CreatePostCommand - mapping request');
    const request = PostRequestMapper.toCreatePostRequest(command.params);
    this.logger.log('[Gateway][Handler] before postGrpcClient.createPost');
    const response = await this.postGrpcClient.createPost(request);
    this.logger.log('[Gateway][Handler] after postGrpcClient.createPost');

    return PostResponseMapper.toCreatePostResponse(response);
  }
}

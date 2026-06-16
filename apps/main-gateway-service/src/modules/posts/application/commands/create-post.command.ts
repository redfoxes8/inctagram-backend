import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

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
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async execute(command: CreatePostCommand): Promise<CreatePostResponseDto> {
    const request = PostRequestMapper.toCreatePostRequest(command.params);
    const response = await this.postGrpcClient.createPost(request);

    return PostResponseMapper.toCreatePostResponse(response);
  }
}

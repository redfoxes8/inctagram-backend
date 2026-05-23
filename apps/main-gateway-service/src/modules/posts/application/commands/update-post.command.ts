import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UpdatePostDto } from '../../api/dto/update-post.dto';
import { PostRequestMapper } from '../../api/mappers/post-request.mapper';
import { PostResponseMapper } from '../../api/mappers/post-response.mapper';
import { PostGrpcClient } from '../../infrastructure/post-grpc.client';
import { CreatePostResponseDto } from '../../api/dto/post-response.dto';

type UpdatePostCommandParams = {
  postId: string;
  dto: UpdatePostDto;
  ownerId: string;
};

export class UpdatePostCommand {
  constructor(public readonly params: UpdatePostCommandParams) {}
}

@CommandHandler(UpdatePostCommand)
export class UpdatePostHandler implements ICommandHandler<
  UpdatePostCommand,
  CreatePostResponseDto
> {
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async execute(command: UpdatePostCommand): Promise<CreatePostResponseDto> {
    const { postId, dto, ownerId } = command.params;

    const request = PostRequestMapper.toUpdatePostRequest({ postId, dto, ownerId });
    const response = await this.postGrpcClient.updatePost(request);

    // Reuse create response mapper since shapes are identical
    return PostResponseMapper.toCreatePostResponse(response as any);
  }
}

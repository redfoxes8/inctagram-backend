import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { PostRequestMapper } from '../../api/mappers/post-request.mapper';
import { PostGrpcClient } from '../../infrastructure/post-grpc.client';

type DeletePostCommandParams = {
  postId: string;
  ownerId: string;
};

export class DeletePostCommand {
  constructor(public readonly params: DeletePostCommandParams) {}
}

@CommandHandler(DeletePostCommand)
export class DeletePostHandler implements ICommandHandler<DeletePostCommand, void> {
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async execute(command: DeletePostCommand): Promise<void> {
    const request = PostRequestMapper.toDeletePostRequest(command.params);

    await this.postGrpcClient.deletePost(request);
  }
}

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainException, DomainExceptionCode } from '../../../../../../../libs/common/src';
import { PostCommandRepository } from '../../infrastructure/repositories/post.command-repository';
import { UpdatePostCommand } from './update-post.command';

@CommandHandler(UpdatePostCommand)
export class UpdatePostHandler implements ICommandHandler<UpdatePostCommand> {
  constructor(private readonly postRepository: PostCommandRepository) {}

  async execute(command: UpdatePostCommand): Promise<void> {
    const { postId, ownerId, description } = command;

    const post = await this.postRepository.findById(postId);
    if (!post) {
      throw new DomainException({ code: DomainExceptionCode.NotFound, message: 'Post not found' });
    }

    if (post.ownerId !== ownerId) {
      throw new DomainException({ code: DomainExceptionCode.Forbidden, message: 'Forbidden' });
    }

    post.updateDescription(description);
    await this.postRepository.updatePost(post);
  }
}

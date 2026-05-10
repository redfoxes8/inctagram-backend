import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainException, DomainExceptionCode } from '../../../../../../../libs/common/src';
import { PostCommandRepository } from '../../infrastructure/repositories/post.command-repository';
import { DeletePostCommand } from './delete-post.command';

@CommandHandler(DeletePostCommand)
export class DeletePostHandler implements ICommandHandler<DeletePostCommand> {
  constructor(private readonly postRepository: PostCommandRepository) {}

  async execute(command: DeletePostCommand): Promise<void> {
    const { postId, ownerId } = command;

    const post = await this.postRepository.findById(postId);
    if (!post) {
      throw new DomainException({ code: DomainExceptionCode.NotFound, message: 'Post not found' });
    }

    if (post.ownerId !== ownerId) {
      throw new DomainException({ code: DomainExceptionCode.Forbidden, message: 'Forbidden' });
    }

    await this.postRepository.deletePost(postId);
    
    // В будущем здесь будет публикация события PostDeletedEvent для RabbitMQ
  }
}

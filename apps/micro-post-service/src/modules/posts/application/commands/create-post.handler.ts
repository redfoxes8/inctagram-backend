import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, OnModuleInit } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { 
  type FileServiceClient, 
  FILE_SERVICE_NAME, 
  FileStatus 
} from '../../../../../../../libs/contracts/src';
import { DomainException, DomainExceptionCode } from '../../../../../../../libs/common/src';
import { CreatePostCommand } from './create-post.command';
import { PostCommandRepository } from '../../infrastructure/repositories/post.command-repository';
import { PostEntity } from '../../domain/post.entity';
import { PostImageEntity } from '../../domain/post-image.entity';

@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand>, OnModuleInit {
  private fileService: FileServiceClient;

  constructor(
    @Inject('FILE_SERVICE_PACKAGE') private readonly client: ClientGrpc,
    private readonly postRepository: PostCommandRepository,
  ) {}

  onModuleInit(): void {
    this.fileService = this.client.getService<FileServiceClient>(FILE_SERVICE_NAME);
  }

  async execute(command: CreatePostCommand): Promise<string> {
    const { ownerId, description, images } = command;

    // 1. Асинхронная валидация файлов через gRPC
    for (const imgDto of images) {
      try {
        const response = await firstValueFrom(this.fileService.getFileStatus({ fileId: imgDto.fileId })) as any;
        
        if (!response || !response.file) {
          throw new DomainException({ code: DomainExceptionCode.BadRequest, message: `File ${imgDto.fileId} not found` });
        }

        if (response.file.status !== FileStatus.UPLOADED) {
          throw new DomainException({ code: DomainExceptionCode.BadRequest, message: `File ${imgDto.fileId} is not uploaded yet` });
        }

        if (response.file.ownerId !== ownerId) {
          throw new DomainException({ code: DomainExceptionCode.Forbidden, message: `File ${imgDto.fileId} does not belong to user` });
        }
      } catch (error) {
        if (error instanceof DomainException) throw error;
        throw new DomainException({ code: DomainExceptionCode.BadRequest, message: `Error validating file ${imgDto.fileId}: ${error.message}` });
      }
    }

    // 2. Создание доменной сущности
    const postEntity = PostEntity.create({
      ownerId,
      description,
    });

    const postImages = images.map((imgDto, index) => 
      PostImageEntity.create({
        postId: postEntity.id,
        fileId: imgDto.fileId,
        order: index,
      })
    );

    postEntity.setImages(postImages);

    // 3. Сохранение в БД
    await this.postRepository.createPost(postEntity);

    return postEntity.id;
  }
}

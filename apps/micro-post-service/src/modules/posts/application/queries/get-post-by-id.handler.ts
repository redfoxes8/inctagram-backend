import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, OnModuleInit, Logger } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { GetPostByIdQuery } from './get-post-by-id.query';
import {
  type FileServiceClient,
  FILE_SERVICE_NAME,
  type GetFilesDataResponse,
} from '../../../../../../../libs/contracts/src';
import { DomainException, DomainExceptionCode } from '../../../../../../../libs/common/src';

@QueryHandler(GetPostByIdQuery)
export class GetPostByIdHandler implements IQueryHandler<GetPostByIdQuery>, OnModuleInit {
  private readonly logger = new Logger(GetPostByIdHandler.name);
  private fileService: FileServiceClient;

  constructor(
    @Inject('FILE_SERVICE_PACKAGE') private readonly client: ClientGrpc,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.fileService = this.client.getService<FileServiceClient>(FILE_SERVICE_NAME);
  }

  async execute(query: GetPostByIdQuery): Promise<any> {
    const { postId } = query;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        images: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!post || post.deletedAt !== null) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Post not found',
      });
    }

    const fileIds = post.images.map((img) => img.fileId);
    let filesMap: Record<string, { fileUrl: string }> = {};

    if (fileIds.length > 0) {
      const fileDataResponse = (await firstValueFrom(
        this.fileService.getFilesData({ fileIds }).pipe(
          timeout(2000),
          catchError((err) => {
            this.logger.error(`Failed to fetch file data from File-MS: ${err.message}`);
            return of({ files: {} } as GetFilesDataResponse);
          }),
        ),
      )) as any;
      filesMap = fileDataResponse.files || {};
    }

    return {
      id: post.id,
      ownerId: post.ownerId,
      description: post.description,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      images: post.images.map((img) => {
        const fileInfo = filesMap[img.fileId];
        let url = fileInfo?.fileUrl || null;

        if (fileInfo && !url) {
          url = `https://loremflickr.com/600/400?lock=${img.fileId}`;
        }

        return {
          id: img.id,
          fileId: img.fileId,
          url,
          order: img.order,
        };
      }),
    };
  }
}

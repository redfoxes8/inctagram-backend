import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, OnModuleInit, Logger } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { GetUserPostsQuery } from './get-user-posts.query';
import { CursorUtil } from '../utils/cursor.util';
import { 
  type FileServiceClient, 
  FILE_SERVICE_NAME,
  type GetFilesDataResponse
} from '../../../../../../../libs/contracts/src';

@QueryHandler(GetUserPostsQuery)
export class GetUserPostsHandler implements IQueryHandler<GetUserPostsQuery>, OnModuleInit {
  private readonly logger = new Logger(GetUserPostsHandler.name);
  private fileService: FileServiceClient;

  constructor(
    @Inject('FILE_SERVICE_PACKAGE') private readonly client: ClientGrpc,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.fileService = this.client.getService<FileServiceClient>(FILE_SERVICE_NAME);
  }

  async execute(query: GetUserPostsQuery) {
    const { ownerId, pageSize, cursor } = query;
    const decodedCursor = cursor ? CursorUtil.decode(cursor) : null;

    const take = pageSize + 1;
    
    // 1. Fetch posts from DB
    const posts = await this.prisma.post.findMany({
      where: { ownerId },
      take,
      cursor: decodedCursor ? { id: decodedCursor.id } : undefined,
      skip: decodedCursor ? 1 : 0,
      orderBy: [
    { createdAt: 'desc' },
    { id: 'desc' }
  ],
      include: {
        images: {
          orderBy: { order: 'asc' },
        },
      },
    });

    const hasMore = posts.length > pageSize;
    const items = hasMore ? posts.slice(0, pageSize) : posts;

    // 2. Batch fetch file data from File-MS
    const fileIds = Array.from(new Set(items.flatMap(p => p.images.map(img => img.fileId)))) as string[];
    
    let filesMap: Record<string, { fileUrl: string }> = {};
    
    if (fileIds.length > 0) {
      const fileDataResponse = await firstValueFrom(
        this.fileService.getFilesData({ fileIds }).pipe(
          timeout(2000),
          catchError(err => {
            this.logger.error(`Failed to fetch file data from File-MS: ${err.message}`);
            return of({ files: {} } as GetFilesDataResponse);
          })
        )
      ) as any;
      filesMap = fileDataResponse.files || {};
    }

    // 3. Map to ViewModel
    const results = items.map(post => ({
      id: post.id,
      ownerId: post.ownerId,
      description: post.description,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      images: post.images.map(img => {
        // MOCKING STRATEGY: Если в File-MS нет URL (S3 еще не готов), возвращаем заглушку
        // Если File-MS упал (filesMap пустой), возвращаем null согласно RFC
        const fileInfo = filesMap[img.fileId];
        let url = fileInfo?.fileUrl || null;

        // Если сервис ответил, но URL пустой (S3 еще не готов), подставляем мок
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
    }));

    const nextCursor = hasMore 
      ? CursorUtil.encode(items[items.length - 1].id, items[items.length - 1].createdAt) 
      : null;

    return {
      posts: results,
      nextCursor,
      hasMore,
    };
  }
}

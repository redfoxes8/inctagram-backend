import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PostQueryRepository } from '../../infrastructure/repositories/post.query-repository';
import { PostEntity } from '../../domain/post.entity';
import { PostMapper } from '../../infrastructure/mappers/post.mapper';
import { FileDataType, PostViewType } from '../../domain/post.types';
import { GetLatestPostsDto } from '../../api/dto/get-latest-posts.dto';
import { GrpcAdapter } from '../../infrastructure/grpc/grpc.adapter';

export class GetLatestPostsQuery {
  constructor(public dto: GetLatestPostsDto) {}
}

@QueryHandler(GetLatestPostsQuery)
export class GetLatestPostsHandler implements IQueryHandler<
  GetLatestPostsQuery,
  PostViewType[] | null
> {
  constructor(
    private postQueryRepository: PostQueryRepository,
    private readonly grpcAdapter: GrpcAdapter,
  ) {}
  async execute({ dto }: GetLatestPostsQuery): Promise<PostViewType[] | null> {
    const result: PostEntity[] = await this.postQueryRepository.getLatestPosts(dto.limit);
    if (result.length === 0) {
      return null;
    }
    const idsOfFiles: string[] = result.flatMap(
      (post) => post.images?.map((image) => image.fileId) ?? [],
    );

    if (idsOfFiles.length === 0) {
      return PostMapper.toView(result);
    }
    const files: FileDataType | null = await this.grpcAdapter.getFilesByIds({
      fileIds: idsOfFiles,
    });
    const mappedPosts: PostViewType[] = PostMapper.toView(result, files);
    return mappedPosts;
  }
}

import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PostQueryRepository } from '../../infrastructure/repositories/post.query-repository';
import { PostEntity } from '../../domain/post.entity';
import { FileGrpcClient } from '../../infrastructure/grpc/file-grpc.client';
import { PostMapper } from '../../infrastructure/mappers/post.mapper';
import { FileDataType, PostViewType } from '../../domain/post.types';
import { GetLatestPostsDto } from '../../api/dto/get-latest-posts.dto';

export class GetLatestPostsQuery {
  constructor(public dto: GetLatestPostsDto) {}
}

@QueryHandler(GetLatestPostsQuery)
export class GetLatestPostsHandler implements IQueryHandler<GetLatestPostsQuery, PostViewType[]> {
  constructor(
    private postQueryRepository: PostQueryRepository,
    private readonly fileGrpcClient: FileGrpcClient,
  ) {}
  async execute({ dto }: GetLatestPostsQuery): Promise<PostViewType[]> {
    const result: PostEntity[] = await this.postQueryRepository.getLatestPosts(dto.limit);
    const idsOfFiles: string[] = result.flatMap(
      (post) => post.images?.map((image) => image.fileId) ?? [],
    );
    const files: FileDataType = await this.fileGrpcClient.getFilesByIds({
      fileIds: idsOfFiles,
    });
    const mappedPosts: PostViewType[] = PostMapper.toView(result, files);
    return mappedPosts;
  }
}

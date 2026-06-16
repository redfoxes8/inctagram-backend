import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetLatestPostsQueryDto, PostViewType } from '../../api/dto/get-latest.dto';
import { IPostGrpcAdapter } from '../../infrastructure/interfaces/post-grpc-adapter.interface';

export class GetLatestPostsQuery {
  constructor(public readonly query: GetLatestPostsQueryDto) {}
}

@QueryHandler(GetLatestPostsQuery)
export class GetLatestPostsHandler implements IQueryHandler<
  GetLatestPostsQuery,
  PostViewType[] | null
> {
  constructor(private readonly postGrpcAdapter: IPostGrpcAdapter) {}
  async execute({ query }: GetLatestPostsQuery): Promise<PostViewType[] | null> {
    const result: PostViewType[] | null = await this.postGrpcAdapter.getLatestPosts(query);
    return result;
  }
}

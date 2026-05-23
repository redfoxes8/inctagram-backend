import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetLatestPostsQueryDto } from '../../api/dto/get-latest.query.dto';
import { PostViewType } from '../../domain/post.types';
import { IPostGrpcAdapter } from '../../infrastructure/interfaces/post-grpc-adapter.interface';

export class GetLatestPostsQuery {
  constructor(public readonly query: GetLatestPostsQueryDto) {}
}

@QueryHandler(GetLatestPostsQuery)
export class GetLatestPostsHandler implements IQueryHandler<GetLatestPostsQuery, PostViewType[]> {
  constructor(private readonly postGrpcAdapter: IPostGrpcAdapter) {}
  async execute({ query }: GetLatestPostsQuery): Promise<PostViewType[]> {
    const result: PostViewType[] = await this.postGrpcAdapter.getLatestPosts(query);
    return result;
  }
}

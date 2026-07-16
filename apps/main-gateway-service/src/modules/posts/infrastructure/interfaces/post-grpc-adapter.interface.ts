import { GetLatestPostsQueryDto, PostViewType } from '../../api/dto/get-latest.dto';

export abstract class IPostGrpcAdapter {
  abstract getLatestPosts(dto: GetLatestPostsQueryDto): Promise<PostViewType[] | null>;

  abstract getPostsCount(userId: string): Promise<number>;
}

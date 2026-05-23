import { GetLatestPostsQueryDto } from '../../api/dto/get-latest.query.dto';
import { PostViewType } from '../../domain/post.types';

export abstract class IPostGrpcAdapter {
  abstract getLatestPosts(dto: GetLatestPostsQueryDto): Promise<PostViewType[]>;
}

import { GetLatestPostsQueryDto, PostViewType } from '../../api/dto/get-latest.dto';

export abstract class IPostGrpcAdapter {
  abstract getLatestPosts(dto: GetLatestPostsQueryDto): Promise<PostViewType[]>;
}

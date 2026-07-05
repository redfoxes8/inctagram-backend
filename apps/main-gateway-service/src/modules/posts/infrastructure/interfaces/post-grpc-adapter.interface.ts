import { GetLatestPostsQueryDto, PostViewType } from '../../api/dto/get-latest.dto';
import { GetProfileRequestDto } from '../../../users/api/dto/get-profile.dto';

export abstract class IPostGrpcAdapter {
  abstract getLatestPosts(dto: GetLatestPostsQueryDto): Promise<PostViewType[] | null>;

  abstract getPostsCount(dto: GetProfileRequestDto): Promise<number>;
}

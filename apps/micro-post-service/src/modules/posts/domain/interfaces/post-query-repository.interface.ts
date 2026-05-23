import { PostEntity } from '../post.entity';

export abstract class IPostQueryRepository {
  abstract getLatestPosts(limit: number): Promise<PostEntity[]>;
}

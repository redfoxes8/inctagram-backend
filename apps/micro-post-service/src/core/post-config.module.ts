import { Global, Module } from '@nestjs/common';
import { PostConfig } from './post.config';

@Global()
@Module({
  providers: [PostConfig],
  exports: [PostConfig],
})
export class PostConfigModule {}

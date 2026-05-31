import { Module } from '@nestjs/common';
import { PostConfig } from './post.config';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [PostConfig],
  exports: [PostConfig],
})
export class PostConfigModule {}

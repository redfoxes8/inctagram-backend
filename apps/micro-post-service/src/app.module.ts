import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostConfigModule } from './core/post-config.module';
import { getEnvPaths } from '../../../libs/common/src/utils/get-env-paths';
import { PostsController } from './modules/posts/posts.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvPaths(),
    }),
    PostConfigModule,
  ],
  controllers: [PostsController],
})
export class AppModule {}

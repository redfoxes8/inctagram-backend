import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostConfigModule } from './core/post-config.module';
import { getEnvPaths } from '../../../libs/common/src/utils/get-env-paths';
import { PostsModule } from './modules/posts/posts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvPaths(),
    }),
    PostConfigModule,
    PostsModule,
  ],
  controllers: [],
})
export class AppModule {}

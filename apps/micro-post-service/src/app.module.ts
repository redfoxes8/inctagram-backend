import { PostConfig } from './core/post.config';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostConfigModule } from './core/post-config.module';
import { getEnvPaths } from '../../../libs/common/src/utils/get-env-paths';
import { PostsModule } from './modules/posts/posts.module';
import { CoreModule } from '../../../libs/common/src/core.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvPaths(),
    }),
    PostConfigModule,
    PostsModule,
    CoreModule,
  ],
  controllers: [],
})
export class AppModule {
  static forRoot(config: PostConfig): DynamicModule {
    return {
      module: AppModule,
      providers: [{ provide: PostConfig, useValue: config }],
      exports: [PostConfig],
    };
  }
}

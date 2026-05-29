import { TestingModule } from '@nestjs/testing';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';

describe('Create Post Integration (skeleton)', () => {
  let module: TestingModule;

  beforeAll(async () => {
    await prepareTestDatabase();
    module = await createTestApp({ imports: [PostsModule] });
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await module.close();
  });

  it.todo('should create a post and persist related images (fill in assertions)');
});

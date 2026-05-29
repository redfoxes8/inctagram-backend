import { TestingModule } from '@nestjs/testing';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';

describe('Migration / Reset Smoke (skeleton)', () => {
  let module: TestingModule;

  beforeAll(async () => {
    // Prepare DB and compile testing module to validate migrations + module bootstrap
    await prepareTestDatabase();
    module = await createTestApp({ imports: [PostsModule] });
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await module.close();
  });

  it.todo('smoke: migrations applied, truncate works, module boots and closes cleanly');
});

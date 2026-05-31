// apps/micro-post-service/test/integration/update-post.integration-spec.ts
import { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { UpdatePostHandler } from '../../src/modules/posts/application/commands/update-post.handler';
import { UpdatePostCommand } from '../../src/modules/posts/application/commands/update-post.command';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { makePost, makeOwnerId } from '../factories/post-test.factory';
import { DomainException, DomainExceptionCode } from '../../../../libs/common/src';

describe('Update Post Integration', () => {
  let module: TestingModule;
  let handler: UpdatePostHandler;
  let repo: PostCommandRepository;
  let prisma: PrismaService;

  beforeAll(async () => {
    await prepareTestDatabase();
    module = await createTestApp(
      { imports: [PostsModule] },
      {
        PORT: '3005',
        GRPC_PORT: '50052',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50052',
      },
    );
    await module.init();
    handler = module.get(UpdatePostHandler);
    repo = module.get(PostCommandRepository);
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await module.close();
  });

  it('successfully updates description and persists changes', async () => {
    // arrange: create a post
    const ownerId = makeOwnerId();
    const post = makePost({ ownerId });
    await repo.createPost(post);
    const originalFileIds = post.images.map((image) => image.fileId);
    const newDesc = 'Updated description';
    const command = new UpdatePostCommand(post.id, ownerId, newDesc);

    // act
    await handler.execute(command);

    // assert
    const persisted = await repo.findById(post.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.description).toBe(newDesc);
    // updatedAt should be later than original createdAt
    expect(persisted!.updatedAt.getTime()).toBeGreaterThan(persisted!.createdAt.getTime());
    // images and ownership stay the same
    expect(persisted!.ownerId).toBe(ownerId);
    expect(persisted!.images).toHaveLength(post.images.length);
    expect(persisted!.images.map((image) => image.fileId)).toEqual(originalFileIds);
  });

  it('throws Forbidden when owner does not match and leaves DB unchanged', async () => {
    const ownerId = makeOwnerId();
    const otherOwner = makeOwnerId();
    const post = makePost({ ownerId });
    await repo.createPost(post);
    const beforeUpdate = await repo.findById(post.id);
    const command = new UpdatePostCommand(post.id, otherOwner, 'Malicious update');

    await expect(handler.execute(command)).rejects.toMatchObject({
      code: DomainExceptionCode.Forbidden,
    });

    const persisted = await repo.findById(post.id);
    expect(persisted).not.toBeNull();
    expect(beforeUpdate).not.toBeNull();
    // unchanged after forbidden update
    expect(persisted!.description).toBe(beforeUpdate!.description);
    expect(persisted!.updatedAt.getTime()).toBe(beforeUpdate!.updatedAt.getTime());
    expect(persisted!.createdAt.getTime()).toBe(beforeUpdate!.createdAt.getTime());
    expect(persisted!.ownerId).toBe(beforeUpdate!.ownerId);
    expect(persisted!.images).toHaveLength(beforeUpdate!.images.length);
  });

  it('throws NotFound when post does not exist', async () => {
    const fakeId = randomUUID();
    const command = new UpdatePostCommand(fakeId, makeOwnerId(), 'Anything');
    await expect(handler.execute(command)).rejects.toMatchObject({
      code: DomainExceptionCode.NotFound,
    });
  });

  it('rejects descriptions longer than 500 characters', async () => {
    const ownerId = makeOwnerId();
    const post = makePost({ ownerId });
    await repo.createPost(post);
    const longDescription = 'a'.repeat(501);

    try {
      await handler.execute(new UpdatePostCommand(post.id, ownerId, longDescription));
      fail('Expected update to reject descriptions longer than 500 characters');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        name: 'Error',
        message: expect.any(String),
      });
    }
  });
});

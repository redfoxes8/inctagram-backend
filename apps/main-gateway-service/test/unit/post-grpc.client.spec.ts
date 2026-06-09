import { of } from 'rxjs';
import { type ClientGrpc } from '@nestjs/microservices';

import { PostGrpcClient } from '../../src/modules/posts/infrastructure/post-grpc.client';
import { POST_SERVICE_NAME, type PostServiceClient } from '../../../../libs/contracts/src';

describe('PostGrpcClient', () => {
  let client: PostGrpcClient;
  let postServiceMock: jest.Mocked<PostServiceClient>;
  let clientGrpcMock: jest.Mocked<ClientGrpc>;

  beforeEach(() => {
    postServiceMock = {
      createPost: jest.fn(),
      updatePost: jest.fn(),
      deletePost: jest.fn(),
      getPostsByUserId: jest.fn(),
      getLatestPosts: jest.fn(),
      ping: jest.fn(),
    } as unknown as jest.Mocked<PostServiceClient>;

    clientGrpcMock = {
      getService: jest.fn().mockReturnValue(postServiceMock),
    } as unknown as jest.Mocked<ClientGrpc>;

    client = new PostGrpcClient(clientGrpcMock);
    client.onModuleInit();
  });

  it('should normalize empty gRPC response to empty posts array', async () => {
    postServiceMock.getLatestPosts.mockReturnValue(of({} as never));

    const response = await client.getLatestPosts({ limit: 8 });

    expect(response).toEqual({ posts: [] });
    expect(clientGrpcMock.getService).toHaveBeenCalledWith(POST_SERVICE_NAME);
  });

  it('should fail strictly for malformed payloads', async () => {
    postServiceMock.getLatestPosts.mockReturnValue(of({ posts: 'broken' as never }));

    await expect(client.getLatestPosts({ limit: 8 })).rejects.toThrow(
      'Malformed GetLatestPostsResponse payload',
    );
  });
});

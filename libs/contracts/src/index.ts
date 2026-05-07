export {
  type Post,
  type CreatePostRequest,
  type CreatePostResponse,
  type UpdatePostRequest,
  type UpdatePostResponse,
  type DeletePostRequest,
  type DeletePostResponse,
  type GetPostsByUserIdRequest,
  type GetPostsByUserIdResponse,
  type PingRequest,
  type PingResponse,
  type PostServiceClient,
  type PostServiceController,
  PostServiceControllerMethods,
  POST_SERVICE_NAME,
  INCTAGRAM_POST_V1_PACKAGE_NAME,
} from './generated/post';

export {
  type File,
  type FileStatus,
  type FileType,
  type GenerateUploadUrlRequest,
  type GenerateUploadUrlResponse,
  type GetFileStatusRequest,
  type GetFileStatusResponse,
  type FileServiceClient,
  type FileServiceController,
  FileServiceControllerMethods,
  FILE_SERVICE_NAME,
  INCTAGRAM_FILE_V1_PACKAGE_NAME,
} from './generated/file';

export * from './post/interfaces/post.service.interface';
export * from './file/interfaces/file.service.interface';

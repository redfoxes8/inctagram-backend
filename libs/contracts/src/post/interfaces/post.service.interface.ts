import { Observable } from 'rxjs';
import {
  CreatePostRequest,
  CreatePostResponse,
  UpdatePostRequest,
  UpdatePostResponse,
  DeletePostRequest,
  DeletePostResponse,
  GetPostsByUserIdRequest,
  GetPostsByUserIdResponse,
  PingRequest,
  PingResponse,
} from '../../generated/post';

export abstract class IPostServiceClient {
  abstract createPost(request: CreatePostRequest): Observable<CreatePostResponse>;
  abstract updatePost(request: UpdatePostRequest): Observable<UpdatePostResponse>;
  abstract deletePost(request: DeletePostRequest): Observable<DeletePostResponse>;
  abstract getPostsByUserId(request: GetPostsByUserIdRequest): Observable<GetPostsByUserIdResponse>;
  abstract ping(request: PingRequest): Observable<PingResponse>;
}

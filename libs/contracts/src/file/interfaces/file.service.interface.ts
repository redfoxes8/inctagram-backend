import { Observable } from 'rxjs';
import {
  GenerateUploadUrlRequest,
  GenerateUploadUrlResponse,
  GetFileStatusRequest,
  GetFileStatusResponse,
} from '../../generated/file';

export abstract class IFileServiceClient {
  abstract generateUploadUrl(
    request: GenerateUploadUrlRequest,
  ): Observable<GenerateUploadUrlResponse>;
  abstract getFileStatus(request: GetFileStatusRequest): Observable<GetFileStatusResponse>;
}

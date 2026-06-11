import { Observable } from 'rxjs';
import {
  GenerateUploadUrlRequest,
  GenerateUploadUrlResponse,
  GetFileStatusRequest,
  GetFileStatusResponse,
  GetFilesDataRequest,
  GetFilesDataResponse,
} from '../../generated/file';

export abstract class IFileServiceClient {
  abstract generateUploadUrl(
    request: GenerateUploadUrlRequest,
  ): Observable<GenerateUploadUrlResponse>;
  abstract getFilesData(request: GetFilesDataRequest): Observable<GetFilesDataResponse>;
  abstract getFileStatus(request: GetFileStatusRequest): Observable<GetFileStatusResponse>;
}

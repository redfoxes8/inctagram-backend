import { type GenerateUploadUrlResponse } from '../../../../../../../libs/contracts/src';

export class FileResponseMapper {
  static toGenerateUploadUrlResponse(
    response: GenerateUploadUrlResponse,
  ): { uploadUrl: string; uploadFields: Record<string, string>; fileId: string } {
    return {
      uploadUrl: response.uploadUrl,
      uploadFields: Object.fromEntries(
        response.uploadFields.map((field) => [field.name, field.value]),
      ),
      fileId: response.fileId,
    };
  }
}

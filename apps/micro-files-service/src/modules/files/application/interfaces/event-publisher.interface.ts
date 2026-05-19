import { FileUploadedPayload } from '../../file-event.constants';

export abstract class IAsyncEventPublisher {
  abstract sendFileUploadedEvent(payload: FileUploadedPayload): Promise<void>;
}

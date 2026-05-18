export abstract class IAsyncEventPublisher {
  abstract sendFileUploadedEvent(payload: any): Promise<void>;
}

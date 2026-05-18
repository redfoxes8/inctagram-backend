export interface IAsyncEventPublisher {
  sendFileUploadedEvent(payload: any): Promise<void>;
}

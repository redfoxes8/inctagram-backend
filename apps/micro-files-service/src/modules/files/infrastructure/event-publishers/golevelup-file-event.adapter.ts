import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { FileEvents, FileUploadedPayload } from '../../file-event.constants';
import { IAsyncEventPublisher } from '../interfaces/event-publisher.interface';
import { DomainException, DomainExceptionCode } from '@inctagram/common';

export class GolevelupFileEventAdapter implements IAsyncEventPublisher {
  constructor(private readonly amqpConnection: AmqpConnection) {}

  public async sendFileUploadedEvent(payload: FileUploadedPayload): Promise<void> {
    try {
      await this.amqpConnection.publish('common_exchange', FileEvents.FileUploaded, payload);
      return;
    } catch (e) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: `Failed to publish file uploaded event: ${e.message}`,
      });
    }
  }
}

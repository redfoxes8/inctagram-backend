import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { defaultIfEmpty, lastValueFrom } from 'rxjs';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

import { FILES_EVENT_CLIENT, FileEvents, FileUploadedPayload } from '../file-event.constants';
import { IAsyncEventPublisher } from '../domain/interfaces/event-publisher.interface';

@Injectable()
export class RabbitFileEventAdapter implements IAsyncEventPublisher {
  constructor(
    @Inject(FILES_EVENT_CLIENT)
    private readonly filesEventClient: ClientProxy,
  ) {}

  public async sendFileUploadedEvent(payload: FileUploadedPayload): Promise<void> {
    try {
      await lastValueFrom(
        this.filesEventClient
          .emit(FileEvents.FileUploaded, payload)
          .pipe(defaultIfEmpty(undefined)),
      );
    } catch (error: unknown) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: this.formatErrorMessage(FileEvents.FileUploaded, error),
      });
    }
  }

  private formatErrorMessage(event: FileEvents, error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : 'Unknown file event error';

    return `Failed to emit ${event}: ${errorMessage}`;
  }
}

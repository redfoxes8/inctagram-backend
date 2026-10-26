import { Injectable } from '@nestjs/common';
import { SuperadminPostPublishedReader } from '../domain/superadmin-post-published-reader.port';
import type {
  SuperadminPostPublishedInput,
  SuperadminPostPublishedView,
} from '../../../../../../libs/common/types/superadmin-posts';
import { SuperadminPostsUnavailableException } from '../../../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import { PaymentPageProfiles } from '../domain/payment-page-profiles.port';

@Injectable()
export class PostPublishedReads {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(
    private readonly reader: SuperadminPostPublishedReader,
    private readonly profiles: PaymentPageProfiles,
  ) {}

  ready(input: { searchUsername: string | null; signal: AbortSignal }): Promise<void> {
    return this.limited({
      signal: input.signal,
      read: (signal) => this.reader.checkProjectionReady({ ...input, signal }),
    });
  }
  view(
    input: SuperadminPostPublishedInput & { signal: AbortSignal },
  ): Promise<SuperadminPostPublishedView> {
    return this.limited({
      signal: input.signal,
      read: (signal) => this.reader.readPublishedView({ ...input, signal }),
    });
  }
  authorMissing(input: { userId: string; signal: AbortSignal }): Promise<boolean> {
    return this.limited({
      signal: input.signal,
      read: async () => {
        const rows = await this.profiles.findProfiles([input.userId]);
        if (rows.some((row) => row.userId !== input.userId))
          throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
        return rows.length === 0;
      },
    });
  }
  private limited<Value>(input: {
    signal: AbortSignal;
    read: (signal: AbortSignal) => Promise<Value>;
  }): Promise<Value> {
    return new Promise<Value>((resolve, reject) => {
      const run = (): void => {
        input.signal.removeEventListener('abort', cancelWaiting);
        if (input.signal.aborted) {
          reject(new SuperadminPostsUnavailableException('NOT_READY'));
          this.waiting.shift()?.();
          return;
        }
        this.active++;
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        input.signal.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 5000);
        const failed = new Promise<never>((_resolve, fail) =>
          controller.signal.addEventListener(
            'abort',
            () => fail(new SuperadminPostsUnavailableException('STORAGE')),
            { once: true },
          ),
        );
        const read = Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new SuperadminPostsUnavailableException('NOT_READY');
          return input.read(controller.signal);
        });
        Promise.race([read, failed])
          .then(resolve, reject)
          .finally(() => {
            clearTimeout(timer);
            input.signal.removeEventListener('abort', abort);
            this.active--;
            this.waiting.shift()?.();
          });
      };
      const cancelWaiting = (): void => {
        const index = this.waiting.indexOf(run);
        if (index >= 0) {
          this.waiting.splice(index, 1);
          input.signal.removeEventListener('abort', cancelWaiting);
          reject(new SuperadminPostsUnavailableException('NOT_READY'));
        }
      };
      if (this.active < 4) run();
      else {
        this.waiting.push(run);
        input.signal.addEventListener('abort', cancelWaiting, { once: true });
        if (input.signal.aborted) cancelWaiting();
      }
    });
  }
}

import type { SuperadminPostSubscriptionEvent } from '../../../../../../libs/common/types/superadmin-posts';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export class PostSubscriptionBuffer implements AsyncIterableIterator<SuperadminPostSubscriptionEvent> {
  private readonly values: SuperadminPostSubscriptionEvent[] = [];
  private pending: {
    resolve: (value: IteratorResult<SuperadminPostSubscriptionEvent>) => void;
    reject: (error: unknown) => void;
  } | null = null;
  private ready = false;
  private closed = false;
  private error: DomainException | null = null;

  constructor(private readonly lifecycle: { cleanup: () => void; unavailable: () => void }) {}

  get isClosed(): boolean {
    return this.closed;
  }
  activate(): void {
    if (!this.closed) {
      this.ready = true;
      this.values.unshift({ kind: 'READY', post: null });
      this.flush();
    }
  }
  enqueue(value: SuperadminPostSubscriptionEvent): boolean {
    if (this.closed) return false;
    // Reserve READY's slot while registration is in progress; total never exceeds100.
    if (this.values.length >= (this.ready ? 100 : 99)) {
      this.fail();
      return false;
    }
    this.values.push(value);
    this.flush();
    return true;
  }
  fail(
    error: DomainException = new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Subscription unavailable; refetch required',
    }),
  ): void {
    if (this.closed) return;
    this.error = error;
    const pending = this.pending;
    this.pending = null;
    this.close();
    pending?.reject(error);
    // Also close a transport blocked in ws.send, which may not request iterator.next again.
    try {
      this.lifecycle.unavailable();
    } catch {
      /* A broken client must not stop other listeners. */
    }
  }
  [Symbol.asyncIterator](): AsyncIterableIterator<SuperadminPostSubscriptionEvent> {
    return this;
  }
  next(): Promise<IteratorResult<SuperadminPostSubscriptionEvent>> {
    if (this.error) return Promise.reject(this.error);
    if (this.closed) return Promise.resolve({ done: true, value: undefined });
    if (this.pending) {
      const error = new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'Subscription unavailable',
      });
      this.fail(error);
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.flush();
    });
  }
  return(): Promise<IteratorResult<SuperadminPostSubscriptionEvent>> {
    this.close();
    this.pending?.resolve({ done: true, value: undefined });
    this.pending = null;
    return Promise.resolve({ done: true, value: undefined });
  }
  private flush(): void {
    if (this.ready && this.pending && this.values.length) {
      const value = this.values.shift()!;
      const pending = this.pending;
      this.pending = null;
      pending.resolve({ done: false, value });
    }
  }
  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.values.length = 0;
    this.lifecycle.cleanup();
  }
}

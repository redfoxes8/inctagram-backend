import { Injectable } from '@nestjs/common';
import type { PostSubscriptionAccess } from '../domain/superadmin-post-published-reader.port';
import type { PostPublishedV1 } from '../../../../../../libs/contracts/src/events/post-published-v1.event';
import type { SuperadminPostPublishedView } from '../../../../../../libs/common/types/superadmin-posts';
import { normalizeSuperadminPostsInput } from '../../../../../../libs/common/src/validation/normalize-superadmin-posts-input';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { SuperadminPostsUnavailableException } from '../../../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import { PostSubscriptionBuffer } from './post-subscription-buffer';
import { PostPublishedReads } from './post-published-reads';

type Listener = {
  id: number;
  searchUsername: string | null;
  access: PostSubscriptionAccess;
  buffer: PostSubscriptionBuffer;
};
export type PostDeliveryOutcome = 'completed' | 'failedRefetch' | 'ignored' | 'disconnected';

@Injectable()
export class PostPublishedDelivery {
  private connected = false;
  private generation = 0;
  private nextId = 0;
  private registering = 0;
  private controller = new AbortController();
  private readonly listeners = new Map<number, Listener>();
  private readonly inFlight = new Map<string, Promise<PostDeliveryOutcome>>();
  private readonly finished = new Map<
    string,
    { outcome: 'completed' | 'failedRefetch'; expiresAt: number }
  >();

  constructor(private readonly reads: PostPublishedReads) {}

  get isBrokerReady(): boolean {
    return this.connected;
  }
  brokerConnected(): void {
    this.brokerDisconnected();
    this.controller = new AbortController();
    this.connected = true;
  }
  brokerDisconnected(): void {
    this.connected = false;
    this.generation++;
    this.controller.abort();
    for (const listener of this.listeners.values()) listener.buffer.fail();
    this.inFlight.clear();
    this.finished.clear();
  }

  async subscribe(input: {
    searchUsername?: string | null;
    access: PostSubscriptionAccess;
  }): Promise<PostSubscriptionBuffer> {
    const searchUsername = normalizeSuperadminPostsInput({
      searchUsername: input.searchUsername,
    }).searchUsername;
    if (this.listeners.size + this.registering >= 100)
      throw new DomainException({
        code: DomainExceptionCode.TooManyRequests,
        message: 'Subscription limit exceeded',
      });
    this.registering++;
    const generation = this.generation;
    const local = new AbortController();
    const signal = AbortSignal.any([local.signal, this.controller.signal]);
    let listener: Listener | null = null;
    const removeCleanup = input.access.onClose(() => {
      local.abort();
      void listener?.buffer.return();
    });
    try {
      await input.access.assertAuthorized();
      this.assertGeneration(generation);
      await this.reads.ready({ searchUsername, signal });
      this.assertGeneration(generation);
      if (signal.aborted) throw new SuperadminPostsUnavailableException('NOT_READY');
      const id = ++this.nextId;
      const buffer = new PostSubscriptionBuffer({
        cleanup: () => {
          this.listeners.delete(id);
          local.abort();
          removeCleanup();
        },
        unavailable: input.access.unavailable,
      });
      listener = { id, searchUsername, buffer, access: input.access };
      this.listeners.set(id, listener);
      // No await from registration through activation: READY precedes even an already in-flight read.
      this.assertGeneration(generation);
      buffer.activate();
      return buffer;
    } catch (error) {
      removeCleanup();
      local.abort();
      await listener?.buffer.return();
      if (this.authFailure(error)) throw error;
      throw new SuperadminPostsUnavailableException('NOT_READY');
    } finally {
      this.registering--;
    }
  }

  handle(event: PostPublishedV1): Promise<PostDeliveryOutcome> {
    if (!this.connected) return Promise.resolve('disconnected');
    const existing = this.inFlight.get(event.postId);
    if (existing) return existing;
    this.prune();
    const cached = this.finished.get(event.postId);
    if (cached) return Promise.resolve(cached.outcome);
    // No listeners => no read and no completed marker that could suppress a registration race.
    if (!this.listeners.size) return Promise.resolve('ignored');
    const generation = this.generation;
    const signal = this.controller.signal;
    const pending = this.deliver({ event, generation, signal })
      .then((outcome) => {
        if (this.current(generation) && (outcome === 'completed' || outcome === 'failedRefetch')) {
          this.finished.set(event.postId, { outcome, expiresAt: Date.now() + 600000 });
          this.prune();
        }
        return outcome;
      })
      .finally(() => {
        if (this.inFlight.get(event.postId) === pending) this.inFlight.delete(event.postId);
      });
    this.inFlight.set(event.postId, pending);
    return pending;
  }

  private async deliver(input: {
    event: PostPublishedV1;
    generation: number;
    signal: AbortSignal;
  }): Promise<PostDeliveryOutcome> {
    let audience: Listener[] | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!this.current(input.generation)) return 'disconnected';
      const initial = (audience ?? [...this.listeners.values()]).filter(
        (listener) => !listener.buffer.isClosed,
      );
      if (!initial.length) return 'ignored';
      try {
        const lookups = new Map<string, Promise<boolean>>();
        let views: Map<string | null, SuperadminPostPublishedView>;
        try {
          views = await this.readViews({
            event: input.event,
            audience: initial,
            signal: input.signal,
            lookups,
          });
        } finally {
          // Freeze the audience after the first reads settle. Registrations during those reads join.
          // Later listeners refetch after READY; this fence stays fixed across all four attempts.
          audience ??= [...this.listeners.values()];
        }
        const additional = audience.filter(
          (listener) => !listener.buffer.isClosed && !views.has(listener.searchUsername),
        );
        const extra = await this.readViews({
          event: input.event,
          audience: additional,
          signal: input.signal,
          lookups,
        });
        for (const [filter, view] of extra) views.set(filter, view);
        for (const listener of audience) {
          if (listener.buffer.isClosed) continue;
          this.assertGeneration(input.generation);
          const view = views.get(listener.searchUsername);
          if (!view || view.outcome !== 'FOUND') continue;
          try {
            await listener.access.assertAuthorized();
          } catch (error) {
            listener.buffer.fail(
              new DomainException({
                code: this.authFailure(error)
                  ? DomainExceptionCode.Unauthorized
                  : DomainExceptionCode.ServiceUnavailable,
                message: 'Subscription unavailable',
              }),
            );
            if (this.authFailure(error)) continue;
            throw new SuperadminPostsUnavailableException('STORAGE');
          }
          this.assertGeneration(input.generation);
          const post = view.post;
          listener.buffer.enqueue({
            kind: 'POST_PUBLISHED',
            post: {
              postId: post.postId,
              userId: post.userId,
              username: post.username,
              description: post.description,
              publishedAt: post.publishedAt,
              images: post.images,
            },
          });
        }
        this.assertGeneration(input.generation);
        return 'completed';
      } catch {
        if (!this.current(input.generation)) return 'disconnected';
        if (attempt === 3) {
          for (const listener of audience ?? initial) listener.buffer.fail();
          return 'failedRefetch';
        }
        if (!(audience ?? initial).some((listener) => !listener.buffer.isClosed)) return 'ignored';
        await this.wait({ milliseconds: 1000 * 2 ** attempt, signal: input.signal });
      }
    }
    return 'failedRefetch';
  }

  private async readViews(input: {
    event: PostPublishedV1;
    audience: Listener[];
    signal: AbortSignal;
    lookups: Map<string, Promise<boolean>>;
  }): Promise<Map<string | null, SuperadminPostPublishedView>> {
    const filters = [...new Set(input.audience.map((listener) => listener.searchUsername))];
    const entries = await Promise.all(
      filters.map(async (searchUsername) => {
        let view = await this.reads.view({
          postId: input.event.postId,
          searchUsername,
          signal: input.signal,
        });
        if (view.outcome === 'UNRESOLVED_AUTHOR') {
          if (view.postId !== input.event.postId || !view.userId?.trim())
            throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
          const authorUserId = view.userId;
          let missing = input.lookups.get(authorUserId);
          if (!missing) {
            missing = this.reads.authorMissing({ userId: authorUserId, signal: input.signal });
            input.lookups.set(authorUserId, missing);
          }
          if (!(await missing)) throw new SuperadminPostsUnavailableException('NOT_READY');
          view = await this.reads.view({
            postId: input.event.postId,
            searchUsername,
            authorMissingConfirmed: true,
            authorUserId,
            signal: input.signal,
          });
          if (view.outcome === 'UNRESOLVED_AUTHOR')
            throw new SuperadminPostsUnavailableException('NOT_READY');
        }
        if (view.outcome === 'FOUND' && view.post.postId !== input.event.postId)
          throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
        return [searchUsername, view] as const;
      }),
    );
    return new Map(entries);
  }

  private wait(input: { milliseconds: number; signal: AbortSignal }): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        input.signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, input.milliseconds);
      input.signal.addEventListener('abort', finish, { once: true });
      if (input.signal.aborted) finish();
    });
  }
  private current(generation: number): boolean {
    return this.connected && generation === this.generation;
  }
  private assertGeneration(generation: number): void {
    if (!this.current(generation)) throw new SuperadminPostsUnavailableException('NOT_READY');
  }
  private prune(): void {
    for (const [id, entry] of this.finished)
      if (entry.expiresAt <= Date.now()) this.finished.delete(id);
    while (this.finished.size > 1000) {
      const oldest = this.finished.keys().next();
      if (oldest.done) break;
      this.finished.delete(oldest.value);
    }
  }
  private authFailure(error: unknown): boolean {
    return error instanceof DomainException && error.code === DomainExceptionCode.Unauthorized;
  }
}

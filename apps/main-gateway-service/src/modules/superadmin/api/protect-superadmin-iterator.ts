import type { ExecutionResult } from 'graphql';
import type { SuperadminWsContext } from './superadmin-context';

// The final non-touch check also protects fields resolved without an explicit Nest ResolveField.
export function protectSuperadminIterator(input: {
  source: AsyncIterable<ExecutionResult>;
  context: SuperadminWsContext;
}): AsyncIterableIterator<ExecutionResult> {
  const iterator = input.source[Symbol.asyncIterator]();
  let finished = false;
  let removeCleanup = (): void => {};
  const finish = async (): Promise<IteratorResult<ExecutionResult>> => {
    if (!finished) {
      finished = true;
      removeCleanup();
      try {
        await iterator.return?.();
      } catch {
        input.context.lifecycle.unavailable();
      }
    }
    return { done: true, value: undefined };
  };
  removeCleanup = input.context.lifecycle.onClose(() => {
    void finish().catch(() => undefined);
  });
  return {
    [Symbol.asyncIterator](): AsyncIterableIterator<ExecutionResult> {
      return this;
    },
    async next(): Promise<IteratorResult<ExecutionResult>> {
      try {
        if (finished) return { done: true, value: undefined };
        const result = await iterator.next();
        if (finished || result.done) return finish();
        await input.context.lifecycle.assertAuthorized();
        if (finished) return { done: true, value: undefined };
        return result;
      } catch {
        input.context.lifecycle.unavailable();
        return finish();
      }
    },
    return: finish,
  };
}

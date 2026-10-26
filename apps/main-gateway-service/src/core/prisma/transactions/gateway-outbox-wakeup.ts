export type GatewayOutbox = 'ACCESS_REVOKE' | 'PAYMENT_PROFILE';

const listeners = new WeakMap<object, Map<GatewayOutbox, () => void>>();

export function listenForGatewayOutbox(input: {
  client: object;
  outbox: GatewayOutbox;
  wake: () => void;
}): () => void {
  const callbacks = listeners.get(input.client) ?? new Map<GatewayOutbox, () => void>();
  listeners.set(input.client, callbacks);
  callbacks.set(input.outbox, input.wake);
  return (): void => {
    if (callbacks.get(input.outbox) === input.wake) callbacks.delete(input.outbox);
  };
}

export function wakeGatewayOutboxes(input: { client: object; outboxes: Set<GatewayOutbox> }): void {
  for (const outbox of input.outboxes) {
    try {
      listeners.get(input.client)?.get(outbox)?.();
    } catch {
      // Commit already succeeded. Durable recovery must not turn it into an HTTP failure.
    }
  }
}

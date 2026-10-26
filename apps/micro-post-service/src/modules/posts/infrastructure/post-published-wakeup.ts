const listeners = new WeakMap<object, () => void>();

export function listenForPostPublished(input: { client: object; wake: () => void }): () => void {
  listeners.set(input.client, input.wake);
  return (): void => {
    if (listeners.get(input.client) === input.wake) listeners.delete(input.client);
  };
}

export function wakePostPublished(client: object): void {
  try {
    listeners.get(client)?.();
  } catch {
    // The source transaction committed; recovery polling retains the durable obligation.
  }
}

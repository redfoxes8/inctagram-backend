import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { JsonObject, JsonValue } from '../types/json-value.type';

const MAX_JSON_DEPTH = 10;
const MAX_JSON_NODES = 1_000;
const MAX_JSON_STRING_LENGTH = 32_768;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type JsonTraversalState = {
  nodes: number;
  ancestors: Set<object>;
};

// Precondition: the provider Strategy passes only verified, normalized, allowlisted data.
export function normalizeProviderWebhookPayload(payload: unknown): JsonValue {
  return normalizeJsonValue(payload, 0, { nodes: 0, ancestors: new Set<object>() });
}

export function cloneJsonValue(value: JsonValue): JsonValue {
  return normalizeProviderWebhookPayload(value);
}

function normalizeJsonValue(value: unknown, depth: number, state: JsonTraversalState): JsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    throw invalidPayload('Webhook payload exceeds safe structural limits');
  }

  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_STRING_LENGTH) {
      throw invalidPayload('Webhook payload string exceeds the safe length limit');
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalidPayload('Webhook payload number must be finite');
    return value;
  }
  if (Array.isArray(value)) {
    return withCycleGuard(value, state, () =>
      Array.from(value, (item) => normalizeJsonValue(item, depth + 1, state)),
    );
  }
  if (typeof value === 'object' && isPlainObject(value)) {
    return withCycleGuard(value, state, () => normalizeJsonObject(value, depth, state));
  }

  throw invalidPayload('Webhook payload must contain only provider-neutral JSON values');
}

function normalizeJsonObject(value: object, depth: number, state: JsonTraversalState): JsonObject {
  const result: JsonObject = Object.create(null) as JsonObject;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || DANGEROUS_KEYS.has(key)) {
      throw invalidPayload('Webhook payload contains an unsafe object key');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw invalidPayload('Webhook payload objects must contain data properties only');
    }
    result[key] = normalizeJsonValue(descriptor.value, depth + 1, state);
  }
  return result;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function withCycleGuard<T>(value: object, state: JsonTraversalState, action: () => T): T {
  if (state.ancestors.has(value)) throw invalidPayload('Webhook payload must not be cyclic');
  state.ancestors.add(value);
  try {
    return action();
  } finally {
    state.ancestors.delete(value);
  }
}

function invalidPayload(message: string): DomainException {
  return new DomainException({ code: DomainExceptionCode.BadRequest, message });
}

import { isUUID } from 'class-validator';

export const POST_PUBLISHED_EXCHANGE = 'common_exchange';
export const POST_PUBLISHED_ROUTING_KEY = 'post.published.v1';

export type PostPublishedV1 = Readonly<{
  schemaVersion: 1;
  eventId: string;
  postId: string;
  ownerId: string;
  publishedAt: string;
}>;

export class PostPublishedContractError extends Error {
  constructor() {
    super('Invalid post published contract');
  }
}

export function parsePostPublishedV1(input: unknown): PostPublishedV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new PostPublishedContractError();
  const fields = input as Record<string, unknown>;
  const keys = ['schemaVersion', 'eventId', 'postId', 'ownerId', 'publishedAt'];
  if (
    Object.keys(fields).length !== keys.length ||
    !Object.keys(fields).every((key) => keys.includes(key)) ||
    fields.schemaVersion !== 1 ||
    typeof fields.eventId !== 'string' ||
    !isUUID(fields.eventId) ||
    typeof fields.postId !== 'string' ||
    !isUUID(fields.postId) ||
    typeof fields.ownerId !== 'string' ||
    !isUUID(fields.ownerId) ||
    typeof fields.publishedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fields.publishedAt) ||
    fields.publishedAt.startsWith('0000')
  )
    throw new PostPublishedContractError();
  const date = new Date(fields.publishedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== fields.publishedAt)
    throw new PostPublishedContractError();
  return {
    schemaVersion: 1,
    eventId: fields.eventId,
    postId: fields.postId,
    ownerId: fields.ownerId,
    publishedAt: fields.publishedAt,
  };
}

import { isUUID, maxLength } from 'class-validator';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  isSuperadminPostTimestamp,
  decodeSuperadminPostsCursor,
} from '../../../../../../libs/common/src/pagination/superadmin-posts-cursor';
import { normalizePaymentUserProfileSnapshot } from '../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';
import { SuperadminPostPublishedOutcome as Outcome } from '../../../../../../libs/contracts/src/generated/post';
import type {
  SuperadminPost,
  SuperadminPostsFilter,
  SuperadminPostsPage,
  SuperadminPostPublishedFilter,
  SuperadminPostPublishedView,
} from '../../../../../../libs/common/types/superadmin-posts';

function invalid(): never {
  throw new DomainException({
    code: DomainExceptionCode.ServiceUnavailable,
    message: 'Invalid posts response',
  });
}
function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  return invalid();
}
function text(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  return invalid();
}
function uuid(value: unknown): string {
  const id = text(value);
  if (!isUUID(id)) return invalid();
  return id;
}
function samePostId(input: { value: unknown; expected: string }): boolean {
  return (
    typeof input.value === 'string' &&
    isUUID(input.value) &&
    input.value.toLowerCase() === input.expected.toLowerCase()
  );
}
function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}
function items(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return invalid();
}
function mapPost(value: unknown): SuperadminPost {
  const source = record(value);
  const postId = uuid(source.postId),
    userId = text(source.userId);
  const username =
    source.username == null
      ? null
      : typeof source.username === 'string' && source.username.length > 0
        ? source.username
        : invalid();
  if (
    typeof source.description !== 'string' ||
    !maxLength(source.description, 500) ||
    !isSuperadminPostTimestamp(source.publishedAt)
  )
    return invalid();
  let userSnapshot: SuperadminPost['userSnapshot'] = null;
  if (source.userSnapshot != null) {
    const snapshot = record(source.userSnapshot);
    try {
      userSnapshot = normalizePaymentUserProfileSnapshot({
        ...snapshot,
        username: snapshot.username ?? null,
      });
    } catch {
      return invalid();
    }
    if (userSnapshot.userId !== userId || userSnapshot.username !== username) return invalid();
  } else if (username !== null) return invalid();
  const rawImages = items(source.images);
  if (rawImages.length > 10) return invalid();
  const images = rawImages.map((value) => {
    const image = record(value);
    const url = nullableText(image.url);
    if (url !== null) {
      try {
        const address = new URL(url);
        if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password)
          return invalid();
      } catch {
        return invalid();
      }
    }
    if (
      typeof image.order !== 'number' ||
      !Number.isInteger(image.order) ||
      image.order < 0 ||
      image.order > 2147483647
    )
      return invalid();
    return { fileId: uuid(image.fileId), order: image.order, url };
  });
  if (
    images.length > 10 ||
    new Set(images.map((image) => image.fileId)).size !== images.length ||
    images.some((image, index) => index > 0 && image.order < images[index - 1].order)
  )
    return invalid();
  return {
    postId,
    userId,
    username,
    description: source.description,
    publishedAt: source.publishedAt,
    images,
    userSnapshot,
  };
}
export function mapSuperadminPostsPage(input: {
  response: unknown;
  filter: SuperadminPostsFilter;
}): SuperadminPostsPage {
  const source = record(input.response);
  const rawPosts = items(source.items);
  if (rawPosts.length > input.filter.first) return invalid();
  const posts = rawPosts.map(mapPost);
  const info = record(source.pageInfo);
  if (posts.length > input.filter.first || typeof info.hasNextPage !== 'boolean') return invalid();
  const endCursor = nullableText(info.endCursor);
  if (
    (!posts.length && (endCursor !== null || info.hasNextPage)) ||
    (posts.length && endCursor === null) ||
    (info.hasNextPage && posts.length !== input.filter.first)
  )
    return invalid();
  if (endCursor) {
    let cursor;
    try {
      cursor = decodeSuperadminPostsCursor({
        value: endCursor,
        searchUsername: input.filter.searchUsername,
      });
    } catch {
      return invalid();
    }
    const last = posts.at(-1)!;
    if (
      !samePostId({ value: cursor.postId, expected: last.postId }) ||
      cursor.createdAt !== last.publishedAt
    )
      return invalid();
  }
  let previous = input.filter.after;
  const ids = new Set<string>();
  for (const post of posts) {
    if (
      ids.has(post.postId.toLowerCase()) ||
      (previous &&
        (post.publishedAt > previous.createdAt ||
          (post.publishedAt === previous.createdAt &&
            post.postId.toLowerCase() >= previous.postId.toLowerCase())))
    )
      return invalid();
    ids.add(post.postId.toLowerCase());
    previous = {
      v: 1,
      createdAt: post.publishedAt,
      postId: post.postId,
      searchUsername: input.filter.searchUsername,
    };
  }
  return { items: posts, pageInfo: { endCursor, hasNextPage: info.hasNextPage } };
}
export function mapSuperadminPostPublishedView(input: {
  response: unknown;
  filter: SuperadminPostPublishedFilter;
}): SuperadminPostPublishedView {
  const source = record(input.response);
  switch (source.outcome) {
    case Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_FOUND: {
      const post = mapPost(source.post);
      if (
        !samePostId({ value: post.postId, expected: input.filter.postId }) ||
        !samePostId({ value: source.postId, expected: post.postId }) ||
        source.authorUserId !== post.userId
      )
        return invalid();
      if (input.filter.authorMissingConfirmed && post.userId !== input.filter.authorUserId)
        return invalid();
      return { outcome: 'FOUND', post };
    }
    case Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_UNRESOLVED_AUTHOR:
      if (
        source.post != null ||
        !samePostId({ value: source.postId, expected: input.filter.postId }) ||
        input.filter.authorMissingConfirmed
      )
        return invalid();
      return {
        outcome: 'UNRESOLVED_AUTHOR',
        postId: uuid(source.postId),
        userId: text(source.authorUserId),
      };
    case Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_NOT_FOUND:
    case Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_FILTERED:
      if (source.post != null || source.postId != null || source.authorUserId != null)
        return invalid();
      return {
        outcome:
          source.outcome === Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_NOT_FOUND
            ? 'NOT_FOUND'
            : 'FILTERED',
      };
    default:
      return invalid();
  }
}

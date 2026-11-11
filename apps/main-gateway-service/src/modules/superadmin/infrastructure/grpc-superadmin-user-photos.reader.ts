import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PostGrpcClient } from '../../posts/infrastructure/post-grpc.client';
import {
  SuperadminUserPhotosReader,
  type SuperadminUserPhotosInput,
  type SuperadminUserPhotosPage,
} from '../domain/superadmin-user-photos.port';

function invalid(): never {
  throw new DomainException({
    code: DomainExceptionCode.ServiceUnavailable,
    message: 'Invalid photos response',
  });
}
function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  return invalid();
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2147483647)
    return invalid();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !isUUID(value)) return invalid();
  return value;
}
function url(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return invalid();
  try {
    const address = new URL(value);
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password)
      return invalid();
  } catch {
    return invalid();
  }
  return value;
}
export function mapSuperadminUserPhotos(input: {
  response: unknown;
  request: SuperadminUserPhotosInput;
}): SuperadminUserPhotosPage {
  const source = record(input.response);
  const totalCount = integer(source.totalCount);
  const page = integer(source.page);
  const pageSize = integer(source.pageSize);
  const pagesCount = integer(source.pagesCount);
  if (
    page !== input.request.page ||
    pageSize !== input.request.pageSize ||
    pagesCount !== Math.ceil(totalCount / pageSize) ||
    typeof source.hasNextPage !== 'boolean' ||
    source.hasNextPage !== page < pagesCount
  )
    return invalid();
  const raw = source.items === undefined ? [] : source.items;
  if (
    !Array.isArray(raw) ||
    raw.length !== Math.min(pageSize, Math.max(totalCount - (page - 1) * pageSize, 0))
  )
    return invalid();
  const items = raw.map((value: unknown) => {
    const item = record(value);
    return { imageId: uuid(item.imageId), postId: uuid(item.postId), url: url(item.url) };
  });
  if (new Set(items.map((item) => item.imageId.toLowerCase())).size !== items.length)
    return invalid();
  return {
    items,
    totalCount,
    pageInfo: { page, pageSize, pagesCount, hasNextPage: source.hasNextPage },
  };
}
@Injectable()
export class GrpcSuperadminUserPhotosReader extends SuperadminUserPhotosReader {
  constructor(private readonly client: PostGrpcClient) {
    super();
  }
  async findPage(input: SuperadminUserPhotosInput): Promise<SuperadminUserPhotosPage> {
    const response: unknown = await this.client.getSuperadminUserPhotos({
      request: input,
      signal: new AbortController().signal,
    });
    return mapSuperadminUserPhotos({ response, request: input });
  }
}

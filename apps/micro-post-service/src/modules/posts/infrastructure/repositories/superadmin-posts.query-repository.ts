import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Prisma } from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PostConfig } from '../../../../core/post.config';
import { SuperadminPostsRead } from '../../application/ports/superadmin-posts-read.port';
import type {
  SuperadminPostsFilter,
  SuperadminPostPublishedFilter,
  SuperadminPostReadPage,
  SuperadminPostPublishedRead,
  SuperadminPostRecord,
  SuperadminPostImageRecord,
} from '../../../../../../../libs/common/types/superadmin-posts';
import { SuperadminPostsUnavailableException } from '../../../../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  encodeSuperadminPostsCursor,
  isSuperadminPostTimestamp,
} from '../../../../../../../libs/common/src/pagination/superadmin-posts-cursor';
import { normalizePaymentUserProfileSnapshot } from '../../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';

type PostRow = {
  ready: boolean;
  postId: string | null;
  userId: string | null;
  username: string | null;
  description: string | null;
  publishedAt: string | null;
  projectedUserId: string | null;
  sourceVersion: bigint | null;
  profileExists: boolean | null;
  isDeleted: boolean | null;
  matches: boolean | null;
  images: unknown;
};

const READINESS = Prisma.sql`
  SELECT COALESCE((SELECT "phase" = 'READY' FROM "post_admin_user_projection_sync"
    WHERE "id" = 'post-user-profile-v1'), false) AS ready
`;
const POST_FACTS = Prisma.sql`
  SELECT p."id" AS "postId", p."ownerId"::text AS "userId", p."description", p."createdAt",
    to_char(p."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt",
    CASE WHEN u."profile_exists" AND NOT u."is_deleted" THEN u."username" ELSE NULL END AS username,
    u."user_id" AS "projectedUserId", u."source_version" AS "sourceVersion",
    u."profile_exists" AS "profileExists", u."is_deleted" AS "isDeleted"
  FROM "Post" p CROSS JOIN readiness
  LEFT JOIN "post_admin_user_profile" u ON u."user_id" = p."ownerId"::text
  WHERE readiness.ready AND p."deletedAt" IS NULL
`;
const POST_IMAGES = Prisma.sql`
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('fileId', image."fileId"::text, 'order', image."order")
    ORDER BY image."order" ASC, image."id" ASC), '[]'::jsonb)
   FROM "PostImage" image WHERE image."postId" = selected."postId")
`;

@Injectable()
export class SuperadminPostsQueryRepository extends SuperadminPostsRead {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PostConfig,
  ) {
    super();
  }

  async findPage(filter: SuperadminPostsFilter): Promise<SuperadminPostReadPage> {
    this.assertEnabled();
    const cursor =
      filter.after === null
        ? Prisma.empty
        : Prisma.sql`
      AND ("createdAt", "postId") < (${filter.after.createdAt}::timestamp, ${filter.after.postId}::uuid)
    `;
    const rows = await this.prisma
      .$queryRaw<PostRow[]>(
        Prisma.sql`
      WITH readiness AS (${READINESS}), facts AS (${POST_FACTS}), candidates AS (
        SELECT * FROM facts
        WHERE (${filter.searchUsername}::text IS NULL OR strpos(lower(username), lower(${filter.searchUsername})) > 0)
        ${cursor}
        ORDER BY "createdAt" DESC, "postId" DESC LIMIT ${filter.first + 1}
      ), positioned AS (
        SELECT *, row_number() OVER (ORDER BY "createdAt" DESC, "postId" DESC) AS position FROM candidates
      )
      SELECT readiness.ready, selected.*,
        CASE WHEN selected.position <= ${filter.first} THEN ${POST_IMAGES} ELSE '[]'::jsonb END AS images
      FROM readiness LEFT JOIN positioned selected ON true
      ORDER BY selected."createdAt" DESC, selected."postId" DESC
    `,
      )
      .catch(() => {
        throw new SuperadminPostsUnavailableException('STORAGE');
      });
    if (!rows[0]?.ready) throw new SuperadminPostsUnavailableException('NOT_READY');
    const found = rows.filter((row) => row.postId !== null);
    const items = found.slice(0, filter.first).map((row) => this.toRecord(row));
    const last = items.at(-1);
    return {
      items,
      pageInfo: {
        endCursor: last
          ? encodeSuperadminPostsCursor({
              v: 1,
              createdAt: last.publishedAt,
              postId: last.postId,
              searchUsername: filter.searchUsername,
            })
          : null,
        hasNextPage: found.length > filter.first,
      },
    };
  }

  async findPublishedView(
    filter: SuperadminPostPublishedFilter,
  ): Promise<SuperadminPostPublishedRead> {
    this.assertEnabled();
    const rows = await this.prisma
      .$queryRaw<PostRow[]>(
        Prisma.sql`
      WITH readiness AS (${READINESS}), facts AS (${POST_FACTS}), candidate AS (
        SELECT *, (${filter.searchUsername}::text IS NULL OR strpos(lower(username), lower(${filter.searchUsername})) > 0) AS matches
        FROM facts WHERE "postId" = ${filter.postId}::uuid
      )
      SELECT readiness.ready, selected.*,
        CASE WHEN selected.matches AND (selected."projectedUserId" IS NOT NULL OR
          (${filter.authorMissingConfirmed} AND selected."userId" = ${filter.authorUserId}))
        THEN ${POST_IMAGES} ELSE '[]'::jsonb END AS images
      FROM readiness LEFT JOIN candidate selected ON true
    `,
      )
      .catch(() => {
        throw new SuperadminPostsUnavailableException('STORAGE');
      });
    const row = rows[0];
    if (!row?.ready) throw new SuperadminPostsUnavailableException('NOT_READY');
    if (row.postId === null) return { outcome: 'NOT_FOUND' };
    if (!row.userId) throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
    if (row.projectedUserId === null) {
      if (!filter.authorMissingConfirmed)
        return { outcome: 'UNRESOLVED_AUTHOR', postId: row.postId, userId: row.userId };
      if (filter.authorUserId !== row.userId) {
        throw new DomainException({
          code: DomainExceptionCode.BadRequest,
          message: 'Invalid missing author confirmation',
        });
      }
    }
    if (row.matches !== true) return { outcome: 'FILTERED' };
    return { outcome: 'FOUND', post: this.toRecord(row) };
  }

  private assertEnabled(): void {
    if (!this.config.userProjectionSyncEnabled)
      throw new SuperadminPostsUnavailableException('SYNC_DISABLED');
  }

  private toRecord(row: PostRow): SuperadminPostRecord {
    if (
      !row.postId ||
      !row.userId ||
      typeof row.description !== 'string' ||
      !isSuperadminPostTimestamp(row.publishedAt)
    )
      throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
    let userSnapshot: SuperadminPostRecord['userSnapshot'] = null;
    if (row.projectedUserId !== null) {
      try {
        userSnapshot = normalizePaymentUserProfileSnapshot({
          userId: row.projectedUserId,
          sourceVersion: row.sourceVersion?.toString(),
          username: row.username,
          profileExists: row.profileExists,
          isDeleted: row.isDeleted,
        });
      } catch {
        throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
      }
    }
    return {
      postId: row.postId,
      userId: row.userId,
      username: row.username,
      description: row.description,
      publishedAt: row.publishedAt,
      userSnapshot,
      images: this.readImages(row.images),
    };
  }

  private readImages(value: unknown): SuperadminPostImageRecord[] {
    if (!Array.isArray(value)) throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
    return value.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object')
        throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
      const image = entry as Record<string, unknown>;
      if (
        typeof image.fileId !== 'string' ||
        !isUUID(image.fileId) ||
        typeof image.order !== 'number' ||
        !Number.isInteger(image.order)
      )
        throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
      return { fileId: image.fileId, order: image.order };
    });
  }
}

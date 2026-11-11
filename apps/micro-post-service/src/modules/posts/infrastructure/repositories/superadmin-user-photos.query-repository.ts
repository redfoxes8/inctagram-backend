import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { SuperadminPostsUnavailableException } from '../../../../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import {
  SuperadminUserPhotosRead,
  type SuperadminUserPhotosInput,
  type SuperadminUserPhotoRecord,
} from '../../application/ports/superadmin-user-photos.port';

type PhotoRow = {
  totalCount: bigint;
  imageId: string | null;
  postId: string | null;
  fileId: string | null;
};

@Injectable()
export class SuperadminUserPhotosQueryRepository extends SuperadminUserPhotosRead {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findPage(
    input: SuperadminUserPhotosInput,
  ): Promise<{ items: SuperadminUserPhotoRecord[]; totalCount: number }> {
    const { userId, page, pageSize } = input;
    const rows = await this.prisma
      .$queryRaw<PhotoRow[]>(
        Prisma.sql`
      WITH photos AS MATERIALIZED (
        SELECT p."createdAt", p."id" AS "postId", i."id" AS "imageId", i."fileId", i."order"
        FROM "Post" p JOIN "PostImage" i ON i."postId" = p."id"
        WHERE p."ownerId" = ${userId}::uuid AND p."deletedAt" IS NULL
      ), selected AS (
        SELECT * FROM photos
        ORDER BY "createdAt" DESC, "postId" DESC, "order" ASC, "imageId" ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      )
      SELECT (SELECT count(*) FROM photos) AS "totalCount", selected."imageId", selected."postId", selected."fileId"
      FROM (SELECT 1) seed LEFT JOIN selected ON true
      ORDER BY selected."createdAt" DESC, selected."postId" DESC, selected."order" ASC, selected."imageId" ASC
    `,
      )
      .catch(() => {
        throw new SuperadminPostsUnavailableException('STORAGE');
      });
    const count = rows[0]?.totalCount;
    if (count === undefined || count < 0n || count > 2147483647n)
      throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
    const items: SuperadminUserPhotoRecord[] = [];
    for (const row of rows) {
      if (row.imageId === null && row.postId === null && row.fileId === null) continue;
      if (!row.imageId || !row.postId || !row.fileId)
        throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
      items.push({ imageId: row.imageId, postId: row.postId, fileId: row.fileId });
    }
    return { items, totalCount: Number(count) };
  }
}

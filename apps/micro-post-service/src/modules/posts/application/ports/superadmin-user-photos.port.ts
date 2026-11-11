export type SuperadminUserPhotosInput = { userId: string; page: number; pageSize: number };
export type SuperadminUserPhotoRecord = { imageId: string; postId: string; fileId: string };
export type SuperadminUserPhoto = { imageId: string; postId: string; url: string | null };
export type SuperadminUserPhotosPage = {
  items: SuperadminUserPhoto[];
  totalCount: number;
  pageInfo: { page: number; pageSize: number; pagesCount: number; hasNextPage: boolean };
};

export abstract class SuperadminUserPhotosRead {
  abstract findPage(input: SuperadminUserPhotosInput): Promise<{
    items: SuperadminUserPhotoRecord[];
    totalCount: number;
  }>;
}

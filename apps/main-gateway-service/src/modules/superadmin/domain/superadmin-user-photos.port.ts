export type SuperadminUserPhotosInput = { userId: string; page: number; pageSize: number };
export type SuperadminUserPhotosPage = {
  items: { imageId: string; postId: string; url: string | null }[];
  totalCount: number;
  pageInfo: { page: number; pageSize: number; pagesCount: number; hasNextPage: boolean };
};
export abstract class SuperadminUserPhotosReader {
  abstract findPage(input: SuperadminUserPhotosInput): Promise<SuperadminUserPhotosPage>;
}

export class GetUserPostsQuery {
  constructor(
    public readonly ownerId: string,
    public readonly pageSize: number = 8,
    public readonly cursor?: string,
  ) {}
}

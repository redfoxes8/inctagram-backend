export class UpdatePostCommand {
  constructor(
    public readonly postId: string,
    public readonly ownerId: string,
    public readonly description: string,
  ) {}
}

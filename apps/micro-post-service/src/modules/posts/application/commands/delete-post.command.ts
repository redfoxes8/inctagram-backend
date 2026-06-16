export class DeletePostCommand {
  constructor(
    public readonly postId: string,
    public readonly ownerId: string,
  ) {}
}

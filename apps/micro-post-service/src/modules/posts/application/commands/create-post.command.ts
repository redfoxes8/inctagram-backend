import { CreatePostDto } from '../dto/create-post.dto';

export class CreatePostCommand {
  public readonly ownerId: string;
  public readonly description: string;
  public readonly images: { fileId: string }[];

  constructor(dto: CreatePostDto) {
    this.ownerId = dto.ownerId;
    this.description = dto.description;
    this.images = dto.images;
  }
}

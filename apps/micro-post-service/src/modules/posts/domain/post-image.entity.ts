import { randomUUID } from 'crypto';

export type PostImageProps = {
  id: string;
  postId: string;
  fileId: string;
  order: number;
};

export class PostImageEntity {
  public readonly id: string;
  public readonly postId: string;
  public readonly fileId: string;
  public readonly order: number;

  constructor(props: PostImageProps) {
    this.id = props.id;
    this.postId = props.postId;
    this.fileId = props.fileId;
    this.order = props.order;
  }

  static create(props: PostImageProps): PostImageEntity {
    const id = randomUUID();

    return new PostImageEntity({ ...props, id });
  }
}

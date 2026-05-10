import { BaseDomainEntity, BaseDomainEntityProps } from '../../../../../../libs/common/src';
import { PostImageEntity } from './post-image.entity';

export type PostProps = BaseDomainEntityProps<string> & {
  ownerId: string;
  description: string;
  images?: PostImageEntity[];
};

export class PostEntity extends BaseDomainEntity<string> {
  public readonly ownerId: string;
  public description: string;
  public images: PostImageEntity[];

  constructor(props: PostProps) {
    super(props);
    this.ownerId = props.ownerId;
    this.description = props.description;
    this.images = props.images || [];
  }

  static create(props: Omit<PostProps, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): PostEntity {
    // ID генерируется на уровне БД или здесь, если нужно. 
    // В данном случае передаем пустую строку или undefined, если инфраструктура сама назначит.
    // Но лучше генерировать в домене для полной независимости.
    return new PostEntity({
      ...props,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  updateDescription(description: string): void {
    if (description.length > 500) {
      throw new Error('Description too long'); // Будет перехвачено и превращено в DomainException
    }
    this.description = description;
    this.touch();
  }

  setImages(images: PostImageEntity[]): void {
    if (images.length < 1 || images.length > 10) {
      throw new Error('Images count must be between 1 and 10');
    }
    this.images = images;
    this.touch();
  }
}

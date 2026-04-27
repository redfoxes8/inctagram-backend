export type EntityId = string | number;

export type BaseDomainEntityProps<TId extends EntityId = string> = {
  id: TId;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
};

export abstract class BaseDomainEntity<TId extends EntityId = string> {
  public readonly id: TId;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public deletedAt: Date | null;

  protected constructor(props: BaseDomainEntityProps<TId>) {
    this.id = props.id;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }

  // Обновляем дату модификации
  public touch(): void {
    this.updatedAt = new Date();
  }

  // Soft delete (мягкое удаление)
  public markAsDeleted(): void {
    this.deletedAt = new Date();
    this.updatedAt = new Date();
  }

  // Восстановление из корзины
  public restore(): void {
    this.deletedAt = null;
    this.updatedAt = new Date();
  }

  public isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}

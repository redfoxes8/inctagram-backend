import { ProductEntity } from '../entities/product.entity';

export abstract class IProductRepository {
  abstract findById(id: string): Promise<ProductEntity | null>;
  abstract findByCode(code: string): Promise<ProductEntity | null>;
  abstract findActive(): Promise<ProductEntity[]>;
  abstract insert(product: ProductEntity): Promise<void>;
  abstract save(product: ProductEntity): Promise<void>;
}

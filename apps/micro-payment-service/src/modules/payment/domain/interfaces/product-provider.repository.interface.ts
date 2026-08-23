import { ProviderCode } from '../value-objects/provider-code.value-object';

export type ProductProviderMapping = Readonly<{
  id: string;
  productId: string;
  provider: ProviderCode;
  providerProductId: string | null;
  providerBillingId: string;
  environment: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ActiveProductProviderLookup = {
  productId: string;
  provider: ProviderCode;
  environment: string;
};

export type ProviderBillingIdentifierLookup = {
  provider: ProviderCode;
  providerBillingId: string;
  environment: string;
};

export abstract class IProductProviderRepository {
  abstract findActiveByProduct(
    lookup: ActiveProductProviderLookup,
  ): Promise<ProductProviderMapping | null>;
  abstract findByProviderBillingId(
    lookup: ProviderBillingIdentifierLookup,
  ): Promise<ProductProviderMapping | null>;
  abstract insert(mapping: ProductProviderMapping): Promise<void>;
  abstract save(mapping: ProductProviderMapping): Promise<void>;
}

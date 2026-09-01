import { ProviderCode } from '../value-objects/provider-code.value-object';

export type ProviderCustomer = Readonly<{
  id: string;
  userId: string;
  provider: ProviderCode;
  providerCustomerId: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type UserProviderCustomerLookup = {
  userId: string;
  provider: ProviderCode;
};

export type ProviderCustomerIdentifierLookup = {
  provider: ProviderCode;
  providerCustomerId: string;
};

export abstract class IProviderCustomerRepository {
  abstract findByUserAndProvider(
    lookup: UserProviderCustomerLookup,
  ): Promise<ProviderCustomer | null>;
  abstract findByProviderCustomerId(
    lookup: ProviderCustomerIdentifierLookup,
  ): Promise<ProviderCustomer | null>;
  abstract insertIfAbsent(customer: ProviderCustomer): Promise<ProviderCustomer>;
}

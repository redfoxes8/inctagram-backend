export type OAuthAccountData = {
  userId: string;
  provider: string;
  providerId: string;
};

export abstract class IOAuthAccountsRepository {
  abstract findByProviderId(
    provider: string,
    providerId: string,
  ): Promise<OAuthAccountData | null>;

  abstract create(data: OAuthAccountData, tx?: unknown): Promise<void>;
}

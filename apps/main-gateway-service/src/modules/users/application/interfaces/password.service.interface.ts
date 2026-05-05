export abstract class IPasswordService {
  abstract hashPassword(password: string): Promise<string>;

  abstract comparePassword(password: string, hash: string): Promise<boolean>;
}

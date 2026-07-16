import { AccountType } from '../../../../core/prisma/client';

export class UserViewType {
  id: string;
  email: string;
  createdAt: string;
  isConfirmed: boolean;
  accountType: AccountType;
}

export type UserMeViewModel = {
  email: string;
  username: string;
};

export abstract class IUsersQueryRepository {
  abstract getUserById(id: string): Promise<UserViewType | null>;

  abstract getUserByEmail(email: string): Promise<UserViewType | null>;

  abstract countActiveUsers(): Promise<number>;
}

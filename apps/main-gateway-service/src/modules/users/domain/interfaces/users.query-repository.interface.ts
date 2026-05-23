export class UserViewModel {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  isConfirmed: boolean;
}

export type UserMeViewModel = {
  email: string;
  username: string;
};

export abstract class IUsersQueryRepository {
  abstract getUserById(id: string): Promise<UserViewModel | null>;

  abstract getUserByEmail(email: string): Promise<UserViewModel | null>;

  abstract getProfileById(id: string): Promise<UserMeViewModel | null>;
  abstract countActiveUsers(): Promise<number>;
}

export class UserViewModel {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  isConfirmed: boolean;
}

export abstract class IUsersQueryRepository {
  abstract getUserById(id: string): Promise<UserViewModel | null>;
}

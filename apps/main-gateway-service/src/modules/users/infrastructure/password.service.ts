import { Injectable } from '@nestjs/common';
import { IPasswordService } from '../application/interfaces/password.service.interface';
import bcrypt from 'bcrypt';

@Injectable()
export class BcryptService implements IPasswordService {
  constructor() {}

  public async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
  }

  public async comparePassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }
}

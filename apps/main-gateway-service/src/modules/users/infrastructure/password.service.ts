import { Injectable } from '@nestjs/common';
import { IPasswordService } from '../application/interfaces/password.service.interface';

@Injectable()
export class BcryptService implements IPasswordService {
  public async hashPassword(password: string): Promise<string> {
    void password;
    throw new Error('BcryptService is not implemented yet');
  }

  public async comparePassword(password: string, hash: string): Promise<boolean> {
    void password;
    void hash;
    throw new Error('BcryptService is not implemented yet');
  }
}

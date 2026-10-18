import { Injectable } from '@nestjs/common';
import { AdminPrincipalVerifier, type AdminPrincipal } from '../domain/admin-principal';

@Injectable()
export class DenyAdminPrincipalVerifier extends AdminPrincipalVerifier {
  verify(input: { sessionToken: string | null }): Promise<AdminPrincipal | null> {
    void input;
    return Promise.resolve(null);
  }
}

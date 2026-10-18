import type { Request, Response } from 'express';
import type { AdminPrincipal } from '../domain/admin-principal';

export type SuperadminContext = {
  req: Request;
  res: Response;
  principal: AdminPrincipal | null;
};

export function createSuperadminContext(input: { req: Request; res: Response }): SuperadminContext {
  return { ...input, principal: null };
}

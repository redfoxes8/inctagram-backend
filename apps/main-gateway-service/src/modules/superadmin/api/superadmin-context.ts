import type { Request, Response } from 'express';
import type { AdminPrincipal } from '../domain/admin-principal';
import type { IncomingMessage } from 'node:http';

export type SuperadminHttpContext = {
  transport: 'http';
  req: Request;
  res: Response;
  principal: AdminPrincipal | null;
};

export type SuperadminWsContext = {
  transport: 'ws';
  request: IncomingMessage;
  principal: AdminPrincipal | null;
  lifecycle: {
    assertAuthorized: () => Promise<AdminPrincipal>;
    unavailable: () => void;
    onClose: (cleanup: () => void) => () => void;
  };
};

export type SuperadminContext = SuperadminHttpContext | SuperadminWsContext;

export function createSuperadminContext(input: {
  req: Request;
  res: Response;
}): SuperadminHttpContext {
  return { ...input, transport: 'http', principal: null };
}

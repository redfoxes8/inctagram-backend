import { Logger } from '@nestjs/common';
import { NextFunction, Request, RequestHandler, Response } from 'express';

type CookieRequest = Request & {
  cookies?: Record<string, string>;
  signedCookies?: Record<string, string>;
};

const logger = new Logger('CookieParserMiddleware');

function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const pair of cookieHeader.split(';')) {
    const [rawKey, ...rawValueParts] = pair.trim().split('=');

    if (!rawKey) {
      continue;
    }

    const key = decodeURIComponent(rawKey.trim());
    const rawValue = rawValueParts.join('=').trim();
    cookies[key] = decodeURIComponent(rawValue);
  }

  return cookies;
}

function createFallbackCookieParser(): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const cookieRequest = request as CookieRequest;
    const cookieHeader = request.headers.cookie;

    cookieRequest.cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
    cookieRequest.signedCookies = {};
    next();
  };
}

export function createCookieParserMiddleware(): RequestHandler {
  try {
    const cookieParser = require('cookie-parser') as () => RequestHandler;

    return cookieParser();
  } catch (error: unknown) {
    logger.warn(
      'cookie-parser is not installed. Falling back to a minimal cookie header parser.',
    );

    return createFallbackCookieParser();
  }
}

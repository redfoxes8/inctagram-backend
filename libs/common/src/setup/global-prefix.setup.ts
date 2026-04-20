import { INestApplication } from '@nestjs/common';

export const GLOBAL_PREFIX = 'api';

export function globalPrefixSetup(app: INestApplication, prefix: string): void {
  app.setGlobalPrefix(prefix);
}

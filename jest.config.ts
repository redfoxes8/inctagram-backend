import type { Config } from 'jest';

const config: Config = {
  projects: [
    '<rootDir>/apps/main-gateway-service/test/jest.config.ts',
    '<rootDir>/apps/micro-files-service/test/jest.config.ts',
    '<rootDir>/apps/micro-notification-service/test/jest.config.ts',
  ],
};

export default config;

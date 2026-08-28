import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30_000,
  maxWorkers: 1,
  roots: ['<rootDir>/..'],
  testMatch: ['**/unit/**/*.spec.ts', '**/integration/**/*.integration-spec.ts'],
};

export default config;

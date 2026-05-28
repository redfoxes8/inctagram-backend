export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  maxWorkers: 1,
  detectOpenHandles: true,
  roots: ['<rootDir>/..'],
  setupFilesAfterEnv: ['<rootDir>/jest.env-setup.ts'],
  testMatch: ['**/integration/**/*.integration-spec.ts'],
};

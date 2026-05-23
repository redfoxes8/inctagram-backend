import { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  maxWorkers: 1,
  setupFiles: ['./jest.env-setup.ts'],
  testEnvironment: 'node',
  testRegex: ['\\.(spec|integration-spec|e2e-spec)\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};

export default config;

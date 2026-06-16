import path from 'path';
import dotenv from 'dotenv';
import { validateTestDatabaseEnvironment } from './validate-test-db-environment';

// Load .env.test into process.env for test runs (explicit, test-only)
const envPath = path.resolve(process.cwd(), 'apps/micro-post-service/.env.test');
const result = dotenv.config({ path: envPath });
if (result.error) {
  // Do not proceed without a test env
  throw result.error;
}

// Run test-only DB environment validation. KEEP THIS OUT OF PRODUCTION RUNTIME.
validateTestDatabaseEnvironment(process.env.DATABASE_URL);

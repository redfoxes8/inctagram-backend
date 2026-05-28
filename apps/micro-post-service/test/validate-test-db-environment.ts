export function validateTestDatabaseEnvironment(databaseUrl?: string) {
  const dbUrl = databaseUrl || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required for tests (set in apps/micro-post-service/.env.test)');
  }

  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('NODE_ENV must not be production for test runs');
  }

  // Forbid known proxy/data-proxy/pooled hosts but allow legitimate prisma hosted DBs like db.prisma.io
  const forbiddenIndicators = [
    'data-proxy',
    'prisma.sh',
    'prisma-data-proxy',
    'data-proxy.prisma',
    'pooled',
    'proxy',
    'ondigitalocean',
    'accelerate',
  ];

  const lower = dbUrl.toLowerCase();
  for (const f of forbiddenIndicators) {
    if (lower.includes(f)) {
      throw new Error(`Forbidden database host detected in DATABASE_URL for tests: contains '${f}'`);
    }
  }

  // Basic SSL hint check — warn only
  try {
    const u = new URL(dbUrl);
    const sslmode = u.searchParams.get('sslmode');
    if (!sslmode) {
      // eslint-disable-next-line no-console
      console.warn('DATABASE_URL does not include sslmode; ensure TLS if connecting to cloud DBs');
    }
  } catch {
    // ignore non-URL connection strings
  }
}

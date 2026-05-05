export const getEnvPaths = () => {
  const env = process.env.NODE_ENV || 'development';

  return [
    process.env.ENV_FILE_PATH?.trim() || '',
    `.env.${env}.local`,
    `.env.${env}`,
    '.env',
  ].filter(Boolean);
};
